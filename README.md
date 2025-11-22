# MeetingFlow AI

**AI-powered real-time meeting transcription and analysis for Obsidian**

[![Version](https://img.shields.io/badge/Version-1.0.0-green)](https://github.com/your-repo/meeting-flow-ai/releases)
[![License](https://img.shields.io/badge/License-MIT-purple)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Obsidian-black)](https://obsidian.md/)

Transform your meetings into searchable, actionable notes with real-time speech-to-text transcription and intelligent AI analysis.

---


![pic](docs/meetingflow_pic.png)


## Features

- **Real-time Transcription** - Compatible with OpenAI realtime standard WebSocket protocol
- **AI Assistant** - Auto-generate summaries and action items
- **Multi-language Support** - Supports Chinese/English language themes
- **Privacy-focused** - End-to-end no user data retention
- **Seamless Integration** - Works directly in Obsidian

## Quick Start

1. **Install**: Download and copy to `YourVault/.obsidian/plugins/`
2. **Configure**: Add your WebSocket address and API key in settings
3. **Start**: Click the squirrel icon function key or press `Ctrl+F9` to begin transcription
4. **Use**: Use the AI meeting assistant for meeting summaries

## Usage

### AI Meeting Assistant Built-in Core Commands
- `/summary` - Generate meeting summary
- `/action-items` - Extract tasks and decisions
- `/translate [language]` - Translate content
- `/help` - Show all available commands

### API Configuration
Configure your speech-to-text service in plugin settings:

```json
{
  "apiEndpoint": "wss://api.openai.com/v1/realtime",
  "apiKey": "your-api-key",
  "model": "whisper-1"
}
```

## Security & Privacy

- **Local Processing**: Transcripts stored directly in your Obsidian vault
- **No Data Retention**: Audio is not stored after processing
- **Enterprise Ready**: Supports self-hosting and custom endpoints

## System Requirements

- Obsidian Desktop
- OpenAI API key or compatible STT service
- Microphone access

## License

[MIT License](LICENSE) - Free for personal and commercial use.

---

**Transform your meetings from time-wasters to productivity powerhouses.**