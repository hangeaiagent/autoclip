"""
Step 2: 时间线提取 - 为大纲中的每个话题定位具体时间区间
"""
import json
import logging
import re
from typing import List, Dict, Any, Optional
from pathlib import Path
from collections import defaultdict

# 导入依赖
from ..utils.llm_client import LLMClient
from ..utils.text_processor import TextProcessor
from ..core.shared_config import PROMPT_FILES, METADATA_DIR

logger = logging.getLogger(__name__)

class TimelineExtractor:
    """从大纲和SRT字幕中提取精确时间线"""

    # 静音间隔阈值（秒），超过此值认为是话题分界
    SILENCE_GAP_THRESHOLD = 5.0

    def __init__(self, metadata_dir: Path = None, prompt_files: Dict = None):
        self.llm_client = LLMClient()
        self.text_processor = TextProcessor()

        # 使用传入的metadata_dir或默认值
        if metadata_dir is None:
            metadata_dir = METADATA_DIR
        self.metadata_dir = metadata_dir

        # 加载提示词
        prompt_files_to_use = prompt_files if prompt_files is not None else PROMPT_FILES
        with open(prompt_files_to_use['timeline'], 'r', encoding='utf-8') as f:
            self.timeline_prompt = f.read()

        # SRT块的目录
        self.srt_chunks_dir = self.metadata_dir / "step1_srt_chunks"
        self.timeline_chunks_dir = self.metadata_dir / "step2_timeline_chunks"
        self.llm_raw_output_dir = self.metadata_dir / "step2_llm_raw_output"

    def _segment_srt_by_silence(self, srt_chunk_data: List[Dict]) -> List[List[Dict]]:
        """
        根据字幕间的静音间隔将SRT预分割为多个片段。
        当两条相邻字幕之间的时间间隔超过阈值时，视为话题分界。
        返回：列表的列表，每个子列表是一个连续的SRT片段。
        """
        if not srt_chunk_data:
            return []

        segments = []
        current_segment = [srt_chunk_data[0]]

        for i in range(1, len(srt_chunk_data)):
            prev_end = self.text_processor.time_to_seconds(
                srt_chunk_data[i - 1]['end_time'].replace(',', '.')
            )
            curr_start = self.text_processor.time_to_seconds(
                srt_chunk_data[i]['start_time'].replace(',', '.')
            )
            gap = curr_start - prev_end

            if gap >= self.SILENCE_GAP_THRESHOLD:
                segments.append(current_segment)
                current_segment = [srt_chunk_data[i]]
            else:
                current_segment.append(srt_chunk_data[i])

        segments.append(current_segment)
        logger.info(f"  > SRT预分割：{len(srt_chunk_data)} 条字幕 → {len(segments)} 个片段（间隔阈值 {self.SILENCE_GAP_THRESHOLD}s）")
        return segments

    def _build_srt_text(self, srt_entries: List[Dict]) -> str:
        """将SRT条目列表构建为LLM可读的SRT文本"""
        text = ""
        for sub in srt_entries:
            text += f"{sub['index']}\\n{sub['start_time']} --> {sub['end_time']}\\n{sub['text']}\\n\\n"
        return text

    def _match_topics_to_srt_segments(self, chunk_outlines: List[Dict], srt_segments: List[List[Dict]]) -> List[str]:
        """
        将话题与SRT片段配对。
        策略：如果话题数等于SRT片段数，直接一一对应；
        否则按顺序分配，多余的话题使用完整SRT。
        返回：每个话题对应的SRT文本列表。
        """
        num_topics = len(chunk_outlines)
        num_segments = len(srt_segments)

        if num_topics == num_segments:
            logger.info(f"  > 话题数({num_topics}) = SRT片段数({num_segments})，一一对应")
            return [self._build_srt_text(seg) for seg in srt_segments]

        if num_segments == 1:
            logger.info(f"  > SRT未能分割（仅1个片段），所有话题使用完整SRT")
            full_srt = self._build_srt_text(srt_segments[0])
            return [full_srt] * num_topics

        # 话题数和片段数不等时，尝试合并相邻片段来匹配
        if num_topics < num_segments:
            logger.info(f"  > 话题数({num_topics}) < SRT片段数({num_segments})，合并相邻片段")
            # 将多个SRT片段均匀分配给话题
            result = []
            segments_per_topic = num_segments / num_topics
            for i in range(num_topics):
                start_idx = int(i * segments_per_topic)
                end_idx = int((i + 1) * segments_per_topic)
                merged = []
                for j in range(start_idx, min(end_idx, num_segments)):
                    merged.extend(srt_segments[j])
                result.append(self._build_srt_text(merged))
            return result

        # num_topics > num_segments：部分话题共享SRT片段
        logger.info(f"  > 话题数({num_topics}) > SRT片段数({num_segments})，部分话题共享片段")
        result = []
        topics_per_segment = num_topics / num_segments
        for i in range(num_topics):
            seg_idx = min(int(i / topics_per_segment), num_segments - 1)
            result.append(self._build_srt_text(srt_segments[seg_idx]))
        return result

    def extract_timeline(self, outlines: List[Dict]) -> List[Dict]:
        """
        提取话题时间区间。
        新版特性：
        - 基于预先分块的SRT
        - 按块批量处理
        - 缓存原始LLM响应，避免重复调用
        - 保存每个块的处理结果作为中间文件，增强健壮性
        """
        logger.info("开始提取话题时间区间...")
        
        if not outlines:
            logger.warning("大纲数据为空，无法提取时间线。")
            return []

        if not self.srt_chunks_dir.exists():
            logger.error(f"SRT块目录不存在: {self.srt_chunks_dir}。请先运行Step 1。")
            return []

        # 1. 创建本步骤需要的目录
        self.timeline_chunks_dir.mkdir(parents=True, exist_ok=True)
        self.llm_raw_output_dir.mkdir(parents=True, exist_ok=True)

        # 2. 按 chunk_index 对所有大纲进行分组
        outlines_by_chunk = defaultdict(list)
        for outline in outlines:
            chunk_index = outline.get('chunk_index')
            if chunk_index is not None:
                outlines_by_chunk[chunk_index].append(outline)
            else:
                logger.warning(f"  > 话题 '{outline.get('title', '未知')}' 缺少 chunk_index，将被跳过。")

        all_timeline_data = []
        # 3. 遍历每个块，逐个话题独立处理，确保每个话题都有对应的时间段
        for chunk_index, chunk_outlines in outlines_by_chunk.items():
            logger.info(f"处理块 {chunk_index}，其中包含 {len(chunk_outlines)} 个话题...")

            chunk_output_path = self.timeline_chunks_dir / f"chunk_{chunk_index}.json"
            chunk_parsed_items = []

            try:
                # 加载对应的SRT块文件
                srt_chunk_path = self.srt_chunks_dir / f"chunk_{chunk_index}.json"
                if not srt_chunk_path.exists():
                    logger.warning(f"  > 找不到对应的SRT块文件: {srt_chunk_path}，跳过整个块。")
                    continue

                with open(srt_chunk_path, 'r', encoding='utf-8') as f:
                    srt_chunk_data = json.load(f)

                if not srt_chunk_data:
                    logger.warning(f"  > SRT块文件为空: {srt_chunk_path}，跳过整个块。")
                    continue

                # 获取时间范围信息
                chunk_start_time = srt_chunk_data[0]['start_time']
                chunk_end_time = srt_chunk_data[-1]['end_time']

                # 预分割SRT：根据静音间隔将SRT切分为多个片段
                srt_segments = self._segment_srt_by_silence(srt_chunk_data)

                # 将话题与SRT片段配对
                topic_srt_texts = self._match_topics_to_srt_segments(chunk_outlines, srt_segments)

                # 逐个话题独立调用LLM，每个话题只看到对应的SRT片段
                for topic_idx, single_outline in enumerate(chunk_outlines):
                    topic_title = single_outline.get('title', '未知')
                    topic_srt = topic_srt_texts[topic_idx]
                    logger.info(f"  > 处理话题 {topic_idx + 1}/{len(chunk_outlines)}: {topic_title}")

                    llm_input_outlines = [
                        {"title": single_outline.get("title"), "subtopics": single_outline.get("subtopics")}
                    ]

                    input_data = {
                        "outline": llm_input_outlines,
                        "srt_text": topic_srt
                    }

                    parsed_items = None
                    max_parse_retries = 2

                    for retry_count in range(max_parse_retries + 1):
                        try:
                            raw_response = self.llm_client.call_with_retry(self.timeline_prompt, input_data)

                            if not raw_response:
                                logger.warning(f"  > 话题 '{topic_title}' LLM响应为空，跳过")
                                break

                            # 保存原始响应
                            cache_file = self.llm_raw_output_dir / f"chunk_{chunk_index}_topic_{topic_idx}_attempt_{retry_count}.txt"
                            with open(cache_file, 'w', encoding='utf-8') as f:
                                f.write(raw_response)

                            parsed_items = self._parse_and_validate_response(
                                raw_response,
                                chunk_start_time,
                                chunk_end_time,
                                chunk_index
                            )

                            if parsed_items:
                                logger.info(f"  > 话题 '{topic_title}' 成功定位时间段")
                                chunk_parsed_items.extend(parsed_items)
                                break
                            else:
                                if retry_count < max_parse_retries:
                                    logger.warning(f"  > 话题 '{topic_title}' 解析失败，重试 ({retry_count + 1}/{max_parse_retries + 1})")
                                    input_data['additional_instruction'] = "\n\n【重要】输出要求：\n1. 必须以[开始，以]结束\n2. 使用英文双引号，不要使用中文引号\n3. 字符串中的引号必须转义为\\\"\n4. 不要添加任何解释文字或代码块标记\n5. 确保JSON格式完全正确"
                                else:
                                    logger.error(f"  > 话题 '{topic_title}' 经过 {max_parse_retries + 1} 次尝试仍然解析失败")
                                    self._save_debug_response(raw_response, chunk_index, f"topic_{topic_idx}_final_parse_failure")

                        except Exception as parse_error:
                            logger.error(f"  > 话题 '{topic_title}' 第 {retry_count + 1} 次尝试解析异常: {parse_error}")
                            if retry_count == max_parse_retries:
                                self._save_debug_response(raw_response if 'raw_response' in locals() else "No response", chunk_index, f"topic_{topic_idx}_parse_exception")
                            continue

                    if not parsed_items:
                        logger.warning(f"  > 话题 '{topic_title}' 最终解析失败，跳过")

                # 保存该块的所有结果
                if chunk_parsed_items:
                    with open(chunk_output_path, 'w', encoding='utf-8') as f:
                        json.dump(chunk_parsed_items, f, ensure_ascii=False, indent=2)
                    logger.info(f"  > 块 {chunk_index} 共成功解析 {len(chunk_parsed_items)} 个时间段（输入 {len(chunk_outlines)} 个话题）")

            except Exception as e:
                logger.error(f"  > 处理块 {chunk_index} 时出错: {str(e)}")
                continue
        
        # 4. 从所有中间文件中拼接最终结果
        logger.info("所有块处理完毕，开始从中间文件拼接最终结果...")
        all_timeline_data = []
        chunk_files = sorted(self.timeline_chunks_dir.glob("*.json"))
        for chunk_file in chunk_files:
            with open(chunk_file, 'r', encoding='utf-8') as f:
                chunk_data = json.load(f)
                all_timeline_data.extend(chunk_data)

        logger.info(f"成功从 {len(chunk_files)} 个块文件中加载了 {len(all_timeline_data)} 个话题。")
        
        # 最终排序：在返回所有结果前，按开始时间进行全局排序
        if all_timeline_data:
            logger.info("按开始时间对所有话题进行最终排序...")
            try:
                # 使用 text_processor 将时间字符串转换为秒数以便正确排序
                all_timeline_data.sort(key=lambda x: self.text_processor.time_to_seconds(x['start_time']))
                logger.info("排序完成。")
                
                # 为所有片段按时间顺序分配固定的ID
                logger.info("为所有片段按时间顺序分配固定ID...")
                for i, timeline_item in enumerate(all_timeline_data):
                    timeline_item['id'] = str(i + 1)
                logger.info(f"已为 {len(all_timeline_data)} 个片段分配了固定ID（1-{len(all_timeline_data)}）")
                
            except Exception as e:
                logger.error(f"对最终结果排序时出错: {e}。返回未排序的结果。")

        return all_timeline_data
        
    def _parse_and_validate_response(self, response: str, chunk_start: str, chunk_end: str, chunk_index: int) -> List[Dict]:
        """增强的解析LLM的批量响应、验证并调整时间"""
        validated_items = []
        
        # 保存原始响应用于调试
        self._save_debug_response(response, chunk_index, "original_response")
        
        try:
            # 尝试解析JSON
            parsed_response = self.llm_client.parse_json_response(response)
            
            # 验证JSON结构
            if not self.llm_client._validate_json_structure(parsed_response):
                logger.error(f"  > 块 {chunk_index} JSON结构验证失败")
                self._save_debug_response(str(parsed_response), chunk_index, "invalid_structure")
                return []
            
            if not isinstance(parsed_response, list):
                logger.warning(f"  > 块 {chunk_index} LLM返回的不是一个列表")
                self._save_debug_response(f"类型: {type(parsed_response)}, 内容: {parsed_response}", chunk_index, "not_list")
                return []
            
            for timeline_item in parsed_response:
                if 'outline' not in timeline_item or 'start_time' not in timeline_item or 'end_time' not in timeline_item:
                    logger.warning(f"  > 从LLM返回的某个JSON对象格式不正确: {timeline_item}")
                    continue
                
                # 将 chunk_index 添加回对象中，以便后续步骤使用
                timeline_item['chunk_index'] = chunk_index
                
                # 验证和调整时间范围
                try:
                    # 验证时间格式
                    if not self._validate_time_format(timeline_item['start_time']):
                        logger.warning(f"  > 话题 '{timeline_item['outline']}' 开始时间格式不正确: {timeline_item['start_time']}")
                        continue
                    
                    if not self._validate_time_format(timeline_item['end_time']):
                        logger.warning(f"  > 话题 '{timeline_item['outline']}' 结束时间格式不正确: {timeline_item['end_time']}")
                        continue
                    
                    start_time = self._convert_time_format(timeline_item['start_time'])
                    end_time = self._convert_time_format(timeline_item['end_time'])
                    
                    start_sec = self.text_processor.time_to_seconds(start_time)
                    end_sec = self.text_processor.time_to_seconds(end_time)
                    chunk_start_sec = self.text_processor.time_to_seconds(chunk_start)
                    chunk_end_sec = self.text_processor.time_to_seconds(chunk_end)
                    
                    if start_sec < chunk_start_sec:
                        logger.warning(f"  > 调整话题 '{timeline_item['outline']}' 的开始时间从 {start_time} 到 {chunk_start}")
                        timeline_item['start_time'] = chunk_start
                    
                    if end_sec > chunk_end_sec:
                        logger.warning(f"  > 调整话题 '{timeline_item['outline']}' 的结束时间从 {end_time} 到 {chunk_end}")
                        timeline_item['end_time'] = chunk_end
                    
                    logger.info(f"  > 定位成功: {timeline_item['outline']} ({timeline_item['start_time']} -> {timeline_item['end_time']})")
                    validated_items.append(timeline_item)
                except Exception as e:
                    logger.error(f"  > 验证单个时间戳时出错: {e} - 项目: {timeline_item}")
                    continue
            
            return validated_items

        except Exception as e:
            logger.error(f"  > 块 {chunk_index} 解析LLM响应时出错: {e}")
            # 保存详细的错误信息
            error_info = {
                "error": str(e),
                "error_type": type(e).__name__,
                "response_length": len(response),
                "response_preview": response[:200],
                "chunk_index": chunk_index,
                "chunk_start": chunk_start,
                "chunk_end": chunk_end
            }
            import json
            self._save_debug_response(json.dumps(error_info, indent=2, ensure_ascii=False), chunk_index, "parse_error")
            return []

    def _validate_time_format(self, time_str: str) -> bool:
        """
        验证时间格式是否正确 (HH:MM:SS,mmm)
        """
        pattern = r'^\d{2}:\d{2}:\d{2},\d{3}$'
        return bool(re.match(pattern, time_str))
    
    def _convert_time_format(self, time_str: str) -> str:
        """
        转换时间格式：SRT格式 -> FFmpeg格式
        """
        if not time_str or time_str == "end":
            return time_str
        return time_str.replace(',', '.')

    def _save_debug_response(self, response: str, chunk_index: int, error_type: str) -> None:
        """保存调试响应到文件"""
        try:
            debug_dir = self.metadata_dir / "debug_responses"
            debug_dir.mkdir(parents=True, exist_ok=True)
            debug_file = debug_dir / f"chunk_{chunk_index}_{error_type}.txt"
            with open(debug_file, 'w', encoding='utf-8') as f:
                f.write(response)
            logger.info(f"调试响应已保存到: {debug_file}")
        except Exception as e:
            logger.error(f"保存调试响应失败: {e}")

    def save_timeline(self, timeline_data: List[Dict], output_path: Optional[Path] = None) -> Path:
        """
        保存时间区间数据
        """
        if output_path is None:
            output_path = METADATA_DIR / "step2_timeline.json"
        
        output_path.parent.mkdir(parents=True, exist_ok=True)
        
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(timeline_data, f, ensure_ascii=False, indent=2)
            
        logger.info(f"时间数据已保存到: {output_path}")
        return output_path

    def load_timeline(self, input_path: Path) -> List[Dict]:
        """
        从文件加载时间数据
        """
        with open(input_path, 'r', encoding='utf-8') as f:
            return json.load(f)

def run_step2_timeline(outline_path: Path, metadata_dir: Path = None, output_path: Optional[Path] = None, prompt_files: Dict = None) -> List[Dict]:
    """
    运行Step 2: 时间点提取
    """
    if metadata_dir is None:
        metadata_dir = METADATA_DIR
        
    extractor = TimelineExtractor(metadata_dir, prompt_files)
    
    # 加载大纲
    with open(outline_path, 'r', encoding='utf-8') as f:
        outlines = json.load(f)
        
    timeline_data = extractor.extract_timeline(outlines)
    
    # 保存结果
    if output_path is None:
        output_path = metadata_dir / "step2_timeline.json"
        
    extractor.save_timeline(timeline_data, output_path)
    
    return timeline_data