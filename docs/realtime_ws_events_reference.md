# 事件参考

## 通用请求头

所有事件都需要包含以下请求头:

| 请求头 | 类型 | 说明 | 示例值 |
|--------|------|------|--------|
| Authorization | 字符串 | 认证令牌 | Bearer $API_KEY |
| OpenAI-Beta | 字符串 | API 版本 | realtime=v1 |

## 客户端事件

### session.update

更新会话的默认配置。

| 参数 | 类型 | 必需 | 说明 | 示例值/可选值 |
|------|------|------|------|---------------|
| event_id | 字符串 | 否 | 客户端生成的事件标识符 | event_123 |
| type | 字符串 | 否 | 事件类型 | session.update |
| modalities | 字符串数组 | 否 | 模型可以响应的模态类型 | ["text", "audio"] |
| instructions | 字符串 | 否 | 预置到模型调用前的系统指令 | "Your knowledge cutoff is 2023-10..." |
| voice | 字符串 | 否 | 模型使用的语音类型 | alloy、echo、shimmer |
| input_audio_format | 字符串 | 否 | 输入音频格式 | pcm16、g711_ulaw、g711_alaw |
| output_audio_format | 字符串 | 否 | 输出音频格式 | pcm16、g711_ulaw、g711_alaw |
| input_audio_transcription.model | 字符串 | 否 | 用于转写的模型 | whisper-1 |
| turn_detection.type | 字符串 | 否 | 语音检测类型 | server_vad |
| turn_detection.threshold | 数字 | 否 | VAD 激活阈值(0.0-1.0) | 0.8 |
| turn_detection.prefix_padding_ms | 整数 | 否 | 语音开始前包含的音频时长 | 500 |
| turn_detection.silence_duration_ms | 整数 | 否 | 检测语音停止的静音持续时间 | 1000 |
| tools | 数组 | 否 | 模型可用的工具列表 | [] |
| tool_choice | 字符串 | 否 | 模型选择工具的方式 | auto/none/required |
| temperature | 数字 | 否 | 模型采样温度 | 0.8 |
| max_output_tokens | 字符串/整数 | 否 | 单次响应最大token数 | "inf"/4096 |

### input_audio_buffer.append

向输入音频缓冲区追加音频数据。

| 参数 | 类型 | 必需 | 说明 | 示例值 |
|------|------|------|------|--------|
| event_id | 字符串 | 否 | 客户端生成的事件标识符 | event_456 |
| type | 字符串 | 否 | 事件类型 | input_audio_buffer.append |
| audio | 字符串 | 否 | Base64编码的音频数据 | Base64EncodedAudioData |

### input_audio_buffer.commit

将缓冲区中的音频数据提交为用户消息。

| 参数 | 类型 | 必需 | 说明 | 示例值 |
|------|------|------|------|--------|
| event_id | 字符串 | 否 | 客户端生成的事件标识符 | event_789 |
| type | 字符串 | 否 | 事件类型 | input_audio_buffer.commit |

### input_audio_buffer.clear

清空输入音频缓冲区中的所有音频数据。

| 参数 | 类型 | 必需 | 说明 | 示例值 |
|------|------|------|------|--------|
| event_id | 字符串 | 否 | 客户端生成的事件标识符 | event_012 |
| type | 字符串 | 否 | 事件类型 | input_audio_buffer.clear |

### conversation.item.create

向对话中添加新的对话项。

| 参数 | 类型 | 必需 | 说明 | 示例值 |
|------|------|------|------|--------|
| event_id | 字符串 | 否 | 客户端生成的事件标识符 | event_345 |
| type | 字符串 | 否 | 事件类型 | conversation.item.create |
| previous_item_id | 字符串 | 否 | 新对话项将插入在此ID之后 | null |
| item.id | 字符串 | 否 | 对话项的唯一标识符 | msg_001 |
| item.type | 字符串 | 否 | 对话项类型 | message/function_call/function_call_output |
| item.status | 字符串 | 否 | 对话项状态 | completed/in_progress/incomplete |
| item.role | 字符串 | 否 | 消息发送者的角色 | user/assistant/system |
| item.content | 数组 | 否 | 消息内容 | [text/audio/transcript] |
| item.call_id | 字符串 | 否 | 函数调用的ID | call_001 |
| item.name | 字符串 | 否 | 被调用的函数名称 | function_name |
| item.arguments | 字符串 | 否 | 函数调用的参数 | {"param": "value"} |
| item.output | 字符串 | 否 | 函数调用的输出结果 | {"result": "value"} |

### conversation.item.truncate

截断助手消息中的音频内容。

| 参数 | 类型 | 必需 | 说明 | 示例值 |
|------|------|------|------|--------|
| event_id | 字符串 | 否 | 客户端生成的事件标识符 | event_678 |
| type | 字符串 | 否 | 事件类型 | conversation.item.truncate |
| item_id | 字符串 | 否 | 要截断的助手消息项的ID | msg_002 |
| content_index | 整数 | 否 | 要截断的内容部分的索引 | 0 |
| audio_end_ms | 整数 | 否 | 音频截断的结束时间点 | 1500 |

### conversation.item.delete

从对话历史中删除指定的对话项。

| 参数 | 类型 | 必需 | 说明 | 示例值 |
|------|------|------|------|--------|
| event_id | 字符串 | 否 | 客户端生成的事件标识符 | event_901 |
| type | 字符串 | 否 | 事件类型 | conversation.item.delete |
| item_id | 字符串 | 否 | 要删除的对话项的ID | msg_003 |

### response.create

触发响应生成。

| 参数 | 类型 | 必需 | 说明 | 示例值 |
|------|------|------|------|--------|
| event_id | 字符串 | 否 | 客户端生成的事件标识符 | event_234 |
| type | 字符串 | 否 | 事件类型 | response.create |
| response.modalities | 字符串数组 | 否 | 响应的模态类型 | ["text", "audio"] |
| response.instructions | 字符串 | 否 | 给模型的指令 | "Please assist the user." |
| response.voice | 字符串 | 否 | 模型使用的语音类型 | alloy/echo/shimmer |
| response.output_audio_format | 字符串 | 否 | 输出音频格式 | pcm16 |
| response.tools | 数组 | 否 | 模型可用的工具列表 | ["type", "name", "description"] |
| response.tool_choice | 字符串 | 否 | 模型选择工具的方式 | auto |
| response.temperature | 数字 | 否 | 采样温度 | 0.7 |
| response.max_output_tokens | 整数/字符串 | 否 | 最大输出token数 | 150/"inf" |

### response.cancel

取消正在进行中的响应生成。

| 参数 | 类型 | 必需 | 说明 | 示例值 |
|------|------|------|------|--------|
| event_id | 字符串 | 否 | 客户端生成的事件标识符 | event_567 |
| type | 字符串 | 否 | 事件类型 | response.cancel |

## 服务端事件


## conversation.created
当对话创建时返回此事件。

参数	类型	必需	说明	示例值
event_id	字符串	否	服务端事件的唯一标识符	event_9101
type	字符串	否	事件类型	conversation.created
conversation	对象	否	对话资源对象	{"id": "conv_001", "object": "realtime.conversation"}


### error

当发生错误时返回的事件。

| 参数 | 类型 | 必需 | 说明 | 示例值 |
|------|------|------|------|--------|
| event_id | 字符串数组 | 否 | 服务端事件的唯一标识符 | ["event_890"] |
| type | 字符串 | 否 | 事件类型 | error |
| error.type | 字符串 | 否 | 错误类型 | invalid_request_error/server_error |
| error.code | 字符串 | 否 | 错误代码 | invalid_event |
| error.message | 字符串 | 否 | 人类可读的错误消息 | "The 'type' field is missing." |
| error.param | 字符串 | 否 | 与错误相关的参数 | null |
| error.event_id | 字符串 | 否 | 相关事件的ID | event_567 |

### conversation.item.input_audio_transcription.completed

当启用输入音频转写功能并且转写成功时返回此事件。

| 参数 | 类型 | 必需 | 说明 | 示例值 |
|------|------|------|------|--------|
| event_id | 字符串 | 否 | 服务端事件的唯一标识符 | event_2122 |
| type | 字符串 | 否 | 事件类型 | conversation.item.input_audio_transcription.completed |
| item_id | 字符串 | 否 | 用户消息项的ID | msg_003 |
| content_index | 整数 | 否 | 包含音频的内容部分的索引 | 0 |
| transcript | 字符串 | 否 | 转写的文本内容 | "Hello, how are you?" |

### conversation.item.input_audio_transcription.failed

当配置了输入音频转写功能,但用户消息的转写请求失败时返回此事件。

| 参数 | 类型 | 必需 | 说明 | 示例值 |
|------|------|------|------|--------|
| event_id | 字符串 | 否 | 服务端事件的唯一标识符 | event_2324 |
| type | 字符串数组 | 否 | 事件类型 | ["conversation.item.input_audio_transcription.failed"] |
| item_id | 字符串 | 否 | 用户消息项的ID | msg_003 |
| content_index | 整数 | 否 | 包含音频的内容部分的索引 | 0 |
| error.type | 字符串 | 否 | 错误类型 | transcription_error |
| error.code | 字符串 | 否 | 错误代码 | audio_unintelligible |
| error.message | 字符串 | 否 | 人类可读的错误消息 | "The audio could not be transcribed." |
| error.param | 字符串 | 否 | 与错误相关的参数 | null |

### conversation.item.truncated

当客户端截断了之前的助手音频消息项时返回此事件。

| 参数 | 类型 | 必需 | 说明 | 示例值 |
|------|------|------|------|--------|
| event_id | 字符串 | 否 | 服务端事件的唯一标识符 | event_2526 |
| type | 字符串 | 否 | 事件类型 | conversation.item.truncated |
| item_id | 字符串 | 否 | 被截断的助手消息项的ID | msg_004 |
| content_index | 整数 | 否 | 被截断的内容部分的索引 | 0 |
| audio_end_ms | 整数 | 否 | 音频被截断的时间点(毫秒) | 1500 |

### conversation.item.deleted

当对话中的某个项目被删除时返回此事件。

| 参数 | 类型 | 必需 | 说明 | 示例值 |
|------|------|------|------|--------|
| event_id | 字符串 | 否 | 服务端事件的唯一标识符 | event_2728 |
| type | 字符串 | 否 | 事件类型 | conversation.item.deleted |
| item_id | 字符串 | 否 | 被删除的对话项的ID | msg_005 |

### input_audio_buffer.committed

当音频缓冲区中的数据被提交时返回此事件。

| 参数 | 类型 | 必需 | 说明 | 示例值 |
|------|------|------|------|--------|
| event_id | 字符串 | 否 | 服务端事件的唯一标识符 | event_1121 |
| type | 字符串 | 否 | 事件类型 | input_audio_buffer.committed |
| previous_item_id | 字符串 | 否 | 新对话项将插入在此ID对应的对话项之后 | msg_001 |
| item_id | 字符串 | 否 | 将要创建的用户消息项的ID | msg_002 |

### input_audio_buffer.cleared

当客户端清空输入音频缓冲区时返回此事件。

| 参数 | 类型 | 必需 | 说明 | 示例值 |
|------|------|------|------|--------|
| event_id | 字符串 | 否 | 服务端事件的唯一标识符 | event_1314 |
| type | 字符串 | 否 | 事件类型 | input_audio_buffer.cleared |

### input_audio_buffer.speech_started

在服务器VAD语音检测模式下，当检测到语音输入时返回此事件。

| 参数 | 类型 | 必需 | 说明 | 示例值 |
|------|------|------|------|--------|
| event_id | 字符串 | 否 | 服务端事件的唯一标识符 | event_1516 |
| type | 字符串 | 否 | 事件类型 | input_audio_buffer.speech_started |
| audio_start_ms | 整数 | 否 | 从会话开始到检测到语音的毫秒数 | 1000 |
| item_id | 字符串 | 否 | 语音停止时将创建的用户消息项的ID | msg_003 |

### input_audio_buffer.speech_stopped

在服务器VAD语音检测模式下，当检测到语音输入停止时返回此事件。

| 参数 | 类型 | 必需 | 说明 | 示例值 |
|------|------|------|------|--------|
| event_id | 字符串 | 否 | 服务端事件的唯一标识符 | event_1718 |
| type | 字符串 | 否 | 事件类型 | input_audio_buffer.speech_stopped |
| audio_start_ms | 整数 | 否 | 从会话开始到检测到语音停止的毫秒数 | 2000 |
| item_id | 字符串 | 否 | 将要创建的用户消息项的ID | msg_003 |

### response.created

当创建新的响应时返回此事件。

| 参数 | 类型 | 必需 | 说明 | 示例值 |
|------|------|------|------|--------|
| event_id | 字符串 | 否 | 服务端事件的唯一标识符 | event_2930 |
| type | 字符串 | 否 | 事件类型 | response.created |
| response.id | 字符串 | 否 | 响应的唯一标识符 | resp_001 |
| response.object | 字符串 | 否 | 对象类型 | realtime.response |
| response.status | 字符串 | 否 | 响应的状态 | in_progress |
| response.status_details | 对象 | 否 | 状态的附加详细信息 | null |
| response.output | 字符串数组 | 否 | 响应生成的输出项列表 | ["[]"] |
| response.usage | 对象 | 否 | 响应的使用统计信息 | null |

### response.done

当响应完成流式传输时返回此事件。

| 参数 | 类型 | 必需 | 说明 | 示例值 |
|------|------|------|------|--------|
| event_id | 字符串 | 否 | 服务端事件的唯一标识符 | event_3132 |
| type | 字符串 | 否 | 事件类型 | response.done |
| response.id | 字符串 | 否 | 响应的唯一标识符 | resp_001 |
| response.object | 字符串 | 否 | 对象类型 | realtime.response |
| response.status | 字符串 | 否 | 响应的最终状态 | completed/cancelled/failed/incomplete |
| response.status_details | 对象 | 否 | 状态的附加详细信息 | null |
| response.output | 字符串数组 | 否 | 响应生成的输出项列表 | ["[...]"] |
| response.usage.total_tokens | 整数 | 否 | 总token数 | 50 |
| response.usage.input_tokens | 整数 | 否 | 输入token数 | 20 |
| response.usage.output_tokens | 整数 | 否 | 输出token数 | 30 |

### response.output_item.added

当响应生成过程中创建新的输出项时返回此事件。

| 参数 | 类型 | 必需 | 说明 | 示例值 |
|------|------|------|------|--------|
| event_id | 字符串 | 否 | 服务端事件的唯一标识符 | event_3334 |
| type | 字符串 | 否 | 事件类型 | response.output_item.added |
| response_id | 字符串 | 否 | 输出项所属的响应ID | resp_001 |
| output_index | 字符串 | 否 | 输出项在响应中的索引 | 0 |
| item.id | 字符串 | 否 | 输出项的唯一标识符 | msg_007 |
| item.object | 字符串 | 否 | 对象类型 | realtime.item |
| item.type | 字符串 | 否 | 输出项类型 | message/function_call/function_call_output |
| item.status | 字符串 | 否 | 输出项状态 | in_progress/completed |
| item.role | 字符串 | 否 | 与输出项关联的角色 | assistant |
| item.content | 数组 | 否 | 输出项的内容 | ["type", "text", "audio", "transcript"] |

### response.output_item.done

当输出项完成流式传输时返回此事件。

| 参数 | 类型 | 必需 | 说明 | 示例值 |
|------|------|------|------|--------|
| event_id | 字符串 | 否 | 服务端事件的唯一标识符 | event_3536 |
| type | 字符串 | 否 | 事件类型 | response.output_item.done |
| response_id | 字符串 | 否 | 输出项所属的响应ID | resp_001 |
| output_index | 字符串 | 否 | 输出项在响应中的索引 | 0 |
| item.id | 字符串 | 否 | 输出项的唯一标识符 | msg_007 |
| item.object | 字符串 | 否 | 对象类型 | realtime.item |
| item.type | 字符串 | 否 | 输出项类型 | message/function_call/function_call_output |
| item.status | 字符串 | 否 | 输出项的最终状态 | completed/incomplete |
| item.role | 字符串 | 否 | 与输出项关联的角色 | assistant |
| item.content | 数组 | 否 | 输出项的内容 | ["type", "text", "audio", "transcript"] |

### response.content_part.added

当响应生成过程中向助手消息项添加新的内容部分时返回此事件。

| 参数 | 类型 | 必需 | 说明 | 示例值 |
|------|------|------|------|--------|
| event_id | 字符串 | 否 | 服务端事件的唯一标识符 | event_3738 |
| type | 字符串 | 否 | 事件类型 | response.content_part.added |
| response_id | 字符串 | 否 | 响应的ID | resp_001 |
| item_id | 字符串 | 否 | 添加内容部分的消息项ID | msg_007 |
| output_index | 整数 | 否 | 输出项在响应中的索引 | 0 |
| content_index | 整数 | 否 | 内容部分在消息项内容数组中的索引 | 0 |
| part.type | 字符串 | 否 | 内容类型 | text/audio |
| part.text | 字符串 | 否 | 文本内容 | "Hello" |
| part.audio | 字符串 | 否 | Base64编码的音频数据 | "base64_encoded_audio_data" |
| part.transcript | 字符串 | 否 | 音频的转写文本 | "Hello" |

### response.content_part.done

当助手消息项中的内容部分完成流式传输时返回此事件。

| 参数 | 类型 | 必需 | 说明 | 示例值 |
|------|------|------|------|--------|
| event_id | 字符串 | 否 | 服务端事件的唯一标识符 | event_3940 |
| type | 字符串 | 否 | 事件类型 | response.content_part.done |
| response_id | 字符串 | 否 | 响应的ID | resp_001 |
| item_id | 字符串 | 否 | 添加内容部分的消息项ID | msg_007 |
| output_index | 整数 | 否 | 输出项在响应中的索引 | 0 |
| content_index | 整数 | 否 | 内容部分在消息项内容数组中的索引 | 0 |
| part.type | 字符串 | 否 | 内容类型 | text/audio |
| part.text | 字符串 | 否 | 文本内容 | "Hello" |
| part.audio | 字符串 | 否 | Base64编码的音频数据 | "base64_encoded_audio_data" |
| part.transcript | 字符串 | 否 | 音频的转写文本 | "Hello" |

### response.text.delta

当"text"类型内容部分的文本值更新时返回此事件。

| 参数 | 类型 | 必需 | 说明 | 示例值 |
|------|------|------|------|--------|
| event_id | 字符串 | 否 | 服务端事件的唯一标识符 | event_4142 |
| type | 字符串 | 否 | 事件类型 | response.text.delta |
| response_id | 字符串 | 否 | 响应的ID | resp_001 |
| item_id | 字符串 | 否 | 消息项的ID | msg_007 |
| output_index | 整数 | 否 | 输出项在响应中的索引 | 0 |
| content_index | 整数 | 否 | 内容部分在消息项内容数组中的索引 | 0 |
| delta | 字符串 | 否 | 文本增量更新内容 | "Sure, I can h" |

### response.text.done

当"text"类型内容部分的文本流式传输完成时返回此事件。

| 参数 | 类型 | 必需 | 说明 | 示例值 |
|------|------|------|------|--------|
| event_id | 字符串 | 否 | 服务端事件的唯一标识符 | event_4344 |
| type | 字符串 | 否 | 事件类型 | response.text.done |
| response_id | 字符串 | 否 | 响应的ID | resp_001 |
| item_id | 字符串 | 否 | 消息项的ID | msg_007 |
| output_index | 整数 | 否 | 输出项在响应中的索引 | 0 |
| content_index | 整数 | 否 | 内容部分在消息项内容数组中的索引 | 0 |
| delta | 字符串 | 否 | 最终的完整文本内容 | "Sure, I can help with that." |

### response.audio_transcript.delta

当模型生成的音频输出转写内容更新时返回此事件。

| 参数 | 类型 | 必需 | 说明 | 示例值 |
|------|------|------|------|--------|
| event_id | 字符串 | 否 | 服务端事件的唯一标识符 | event_4546 |
| type | 字符串 | 否 | 事件类型 | response.audio_transcript.delta |
| response_id | 字符串 | 否 | 响应的ID | resp_001 |
| item_id | 字符串 | 否 | 消息项的ID | msg_008 |
| output_index | 整数 | 否 | 输出项在响应中的索引 | 0 |
| content_index | 整数 | 否 | 内容部分在消息项内容数组中的索引 | 0 |
| delta | 字符串 | 否 | 转写文本的增量更新内容 | "Hello, how can I a" |

### response.audio_transcript.done

当模型生成的音频输出转写完成流式传输时返回此事件。

| 参数 | 类型 | 必需 | 说明 | 示例值 |
|------|------|------|------|--------|
| event_id | 字符串 | 否 | 服务端事件的唯一标识符 | event_4748 |
| type | 字符串 | 否 | 事件类型 | response.audio_transcript.done |
| response_id | 字符串 | 否 | 响应的ID | resp_001 |
| item_id | 字符串 | 否 | 消息项的ID | msg_008 |
| output_index | 整数 | 否 | 输出项在响应中的索引 | 0 |
| content_index | 整数 | 否 | 内容部分在消息项内容数组中的索引 | 0 |
| transcript | 字符串 | 否 | 音频的最终完整转写文本 | "Hello, how can I assist you today?" |

### response.audio.delta

当模型生成的音频内容更新时返回此事件。

| 参数 | 类型 | 必需 | 说明 | 示例值 |
|------|------|------|------|--------|
| event_id | 字符串 | 否 | 服务端事件的唯一标识符 | event_4950 |
| type | 字符串 | 否 | 事件类型 | response.audio.delta |
| response_id | 字符串 | 否 | 响应的ID | resp_001 |
| item_id | 字符串 | 否 | 消息项的ID | msg_008 |
| output_index | 整数 | 否 | 输出项在响应中的索引 | 0 |
| content_index | 整数 | 否 | 内容部分在消息项内容数组中的索引 | 0 |
| delta | 字符串 | 否 | Base64编码的音频数据增量 | "Base64EncodedAudioDelta" |

### response.audio.done

当模型生成的音频完成时返回此事件。

| 参数 | 类型 | 必需 | 说明 | 示例值 |
|------|------|------|------|--------|
| event_id | 字符串 | 否 | 服务端事件的唯一标识符 | event_5152 |
| type | 字符串 | 否 | 事件类型 | response.audio.done |
| response_id | 字符串 | 否 | 响应的ID | resp_001 |
| item_id | 字符串 | 否 | 消息项的ID | msg_008 |
| output_index | 整数 | 否 | 输出项在响应中的索引 | 0 |
| content_index | 整数 | 否 | 内容部分在消息项内容数组中的索引 | 0 |

## 函数调用

### response.function_call_arguments.delta

当模型生成的函数调用参数更新时返回此事件。

| 参数 | 类型 | 必需 | 说明 | 示例值 |
|------|------|------|------|--------|
| event_id | 字符串 | 否 | 服务端事件的唯一标识符 | event_5354 |
| type | 字符串 | 否 | 事件类型 | response.function_call_arguments.delta |
| response_id | 字符串 | 否 | 响应的ID | resp_002 |
| item_id | 字符串 | 否 | 消息项的ID | fc_001 |
| output_index | 整数 | 否 | 输出项在响应中的索引 | 0 |
| call_id | 字符串 | 否 | 函数调用的ID | call_001 |
| delta | 字符串 | 否 | JSON格式的函数调用参数增量 | "{\"location\": \"San\"" |

### response.function_call_arguments.done

当模型生成的函数调用参数完成流式传输时返回此事件。

| 参数 | 类型 | 必需 | 说明 | 示例值 |
|------|------|------|------|--------|
| event_id | 字符串 | 否 | 服务端事件的唯一标识符 | event_5556 |
| type | 字符串 | 否 | 事件类型 | response.function_call_arguments.done |
| response_id | 字符串 | 否 | 响应的ID | resp_002 |
| item_id | 字符串 | 否 | 消息项的ID | fc_001 |
| output_index | 整数 | 否 | 输出项

