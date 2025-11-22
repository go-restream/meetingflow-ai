import { App, Plugin } from 'obsidian';

// Interface to avoid circular dependency
export interface AiMeetingSidebarPlugin extends Plugin {
	app: App;
	settings: SpeechTranscriptionSettings;
	aiClient?: any;
	commandManager?: any;
	sessionManager?: any;
	historyManager?: any;
}

interface SpeechTranscriptionSettings {
	apiEndpoint: string;
	apiKey: string;
	model: string;
	language: string;
	audioFormat: string;
	sampleRate: number;
	channels: number;
	vadSensitivity: number;
	maxAudioDuration: number;
	aiApiEndpoint: string;
	aiApiKey: string;
	aiModel: string;
	enableAiSidebar: boolean;
	maxHistoryItems: number;
	maxConversationHistory: number;
	slashCommands: { [key: string]: SlashCommandConfig };
}

interface SlashCommandConfig {
	name: string;
	prompt: string;
	enabled: boolean;
	alias?: string;
	parameters?: { [key: string]: any };
}