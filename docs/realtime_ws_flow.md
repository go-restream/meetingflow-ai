

服务端语音转写（ASR）的WebSocket连接方式涉及以下事件协议：

## 🔌 连接建立
```JavaScript
const ws = new WebSocket(
  "wss://你的api服务器地址/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17",
  {
    headers: {
      "Authorization": "Bearer YOUR_API_KEY",
      "OpenAI-Beta": "realtime=v1"
    }
  }
);
```


## 📨 客户端事件（发送到服务器）
### 1. session.update - 配置ASR会话
```JSON
{
  "type": "session.update",
  "modalities": ["text"],           // 仅文本模式（转写结果）
  "input_audio_transcription": {
    "model": "whisper-1",           // ASR转写模型
    "language": "auto"              // 自动检测语言
  },
  "turn_detection": {
    "type": "server_vad",           // 服务器端语音检测 VAD 配置
    "threshold": 0.5,
    "silence_duration_ms": 1000
  }
}
```

### 2. 音频输入相关事件

- input_audio_buffer.append - 追加音频数据
- input_audio_buffer.commit - 提交音频为消息
- input_audio_buffer.clear - 清空音频缓冲区



## 📤 服务端事件（服务器返回）

- ASR转写核心事件
conversation.item.input_audio_transcription.completed - 转写完成（核心事件）
conversation.item.input_audio_transcription.failed - 转写失败

- 语音检测事件
input_audio_buffer.speech_started - 检测到语音开始
input_audio_buffer.speech_stopped - 检测到语音停止

- 音频处理事件
input_audio_buffer.committed - 音频提交确认
input_audio_buffer.cleared - 音频缓冲区清空确认

- 对话管理事件
conversation.item.created - 转写文本对话项创建



## 💡 关键配置参数（仅ASR）
- 会话配置
```JavaScript
{
  "modalities": ["text"],           // 仅文本输出（转写结果）
  "input_audio_transcription": {
    "model": "whisper-1",           // ASR模型
    "language": "auto",             // 语言检测
    "prompt": "转写提示词"          // 可选提示
  },
  "turn_detection": {               // 语音活动检测
    "type": "server_vad",
    "threshold": 0.5,
    "prefix_padding_ms": 300,
    "silence_duration_ms": 800
  }
}
```


- 音频格式配置
```JavaScript
{
  "input_audio_format": "pcm16",    // 输入音频格式
  "sample_rate": 16000,             // 采样率
  "channels": 1                     // 单声道
}
```



## 🔄 典型ASR工作流程

### 阶段1：会话初始化
连接建立 → WebSocket连接成功
服务端接受连接，建立WebSocket会话

会话配置 →    session.update  设置ASR模式
服务器端务返回会话创建成功事件：session.created (会话创建)、conversation.created​（对话创建）
session.updated (确认配置)

### 阶段2：音频输入与检测

语音开始 →    input_audio_buffer.speech_started  检测到语音
音频传输 →    input_audio_buffer.append  流式发送音频数据
语音停止 →    input_audio_buffer.speech_stopped  检测到语音结束
音频提交 →    input_audio_buffer.commit  提交音频处理

### 阶段3：转写结果返回
转写完成服务器端返回事件 →    conversation.item.input_audio_transcription.completed  返回转写文本
服务端返回对话项创建 →    conversation.item.created  创建转写文本对话项


## 📊 事件序列示例
```Plain Text
客户端 → 服务端: WebSocket连接
服务端接受连接，建立WebSocket会话

服务端 → 客户端: session.created (会话创建)
服务端 → 客户端: conversation.created​​ - 创建业务层面的对话容器（消息历史、对话上下文）
客户端 → 服务端: session.update (配置ASR)
服务端 → 客户端: session.updated (确认配置)

客户端 → 服务端: input_audio_buffer.append × N (流式音频数据)
服务端 → 客户端: input_audio_buffer.speech_started (VAD检测到语音)
服务端 → 客户端: input_audio_buffer.speech_stopped (VAD语音结束) -- 当客户端收到服务器端的此事件，则发送input_audio_buffer.commit事件
客户端 → 服务端: input_audio_buffer.commit (提交音频)
服务端 → 客户端: input_audio_buffer.committed (提交确认)

客户端 → 服务端: input_audio_buffer.clear (提交清空)  --可选
服务端 → 客户端: input_audio_buffer.cleared (清空音频缓冲区中的所有音频数据) --可选

服务端 → 客户端: conversation.item.input_audio_transcription.completed (转写结果)
服务端 → 客户端: conversation.item.created (对话项创建)
```


## 🎯 ASR专用事件详解

### 转写成功事件
```JavaScript
{
  "event_id": "event_2122",
  "type": "conversation.item.input_audio_transcription.completed",
  "item_id": "msg_003",
  "content_index": 0,
  "transcript": "这是转写后的文本内容"  // ASR核心输出
}
```
### 转写失败事件
```javascript
{
  "event_id": "event_2324",
  "type": "conversation.item.input_audio_transcription.failed",
  "item_id": "msg_003",
  "content_index": 0,
  "error": {
    "type": "transcription_error",
    "code": "audio_unintelligible",
    "message": "音频无法识别"
  }
}
```


### VAD语音检测开始事件
```javascript
{
  "event_id": "event_1516",
  "type": "input_audio_buffer.speech_started",
  "audio_start_ms": 1000,
  "item_id": "msg_003"
}
```

### VAD语音结束事件
### input_audio_buffer.speech_stopped

在服务器语音检测模式下，当检测到语音输入停止时返回此事件。

| 参数 | 类型 | 必需 | 说明 | 示例值 |
|------|------|------|------|--------|
| event_id | 字符串 | 否 | 服务端事件的唯一标识符 | event_1718 |
| type | 字符串 | 否 | 事件类型 | input_audio_buffer.speech_stopped |
| audio_start_ms | 整数 | 否 | 从会话开始到检测到语音停止的毫秒数 | 2000 |
| item_id | 字符串 | 否 | 将要创建的用户消息项的ID | msg_003 |


### input_audio_buffer.speech_stopped

在服务器VAD语音检测模式下，当检测到语音输入停止时返回此事件。

| 参数 | 类型 | 必需 | 说明 | 示例值 |
|------|------|------|------|--------|
| event_id | 字符串 | 否 | 服务端事件的唯一标识符 | event_1718 |
| type | 字符串 | 否 | 事件类型 | input_audio_buffer.speech_stopped |
| audio_start_ms | 整数 | 否 | 从会话开始到检测到语音停止的毫秒数 | 2000 |
| item_id | 字符串 | 否 | 将要创建的用户消息项的ID | msg_003 |




