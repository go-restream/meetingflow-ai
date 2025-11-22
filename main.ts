import { App, MarkdownView, Notice, Plugin, PluginSettingTab, Setting, WorkspaceLeaf, Modal } from 'obsidian';
import { AiClient } from './ai-sidebar/ai-client';
import { CommandManager, SlashCommandConfig } from './ai-sidebar/command-manager';
import { SessionManager } from './ai-sidebar/session-manager';
import { HistoryManager } from './ai-sidebar/history-manager';
import { AiSidebarView } from './ai-sidebar/ai-sidebar-view';
import { I18nManager } from './src/i18n';
import type { TranslateFunction, TranslationKeys } from './src/i18n';

enum HeartbeatType {
	PING = 0,
	PONG = 1,
	RETRY = 2
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


const DEFAULT_SETTINGS: SpeechTranscriptionSettings = {
	apiEndpoint: 'wss://your-api-server/v1/realtime',
	apiKey: '',
	model: 'whisper-1',
	language: 'en',
	audioFormat: 'pcm48',
	sampleRate: 48000,
	channels: 1,
	vadSensitivity: 0.5,
	maxAudioDuration: 10,

	aiApiEndpoint: 'https://api.openai.com/v1/chat/completions',
	aiApiKey: '',
	aiModel: 'gpt-3.5-turbo',
	enableAiSidebar: true,
	maxHistoryItems: 50,
	maxConversationHistory: 10,
	slashCommands: {
		'summary': {
			name: 'summary',
			prompt: '', // Will be set dynamically based on locale
			enabled: true,
			alias: 'su'
		},
		'translate': {
			name: 'translate',
			prompt: '', // Will be set dynamically based on locale
			enabled: true,
			alias: 'tr'
		},
		'rewrite': {
			name: 'rewrite',
			prompt: '', // Will be set dynamically based on locale
			enabled: true,
			alias: 'rw'
		},
		'action-items': {
			name: 'action-items',
			prompt: '', // Will be set dynamically based on locale
			enabled: true,
			alias: 'ai'
		}
	}
}

export default class AiMeetingSidebarPlugin extends Plugin {
	settings!: SpeechTranscriptionSettings;
	private i18nManager!: I18nManager;
	public t!: TranslateFunction;

	private websocket: WebSocket | null = null;
	private mediaRecorder: ScriptProcessorNode | null = null;
	private audioContext: AudioContext | null = null;
	private mediaStream: MediaStream | null = null;
	private isTranscribing: boolean = false;
	private statusBarItemEl!: HTMLElement;
	private maxDurationTimeout: number | null = null;
	private hasSpeechStarted: boolean = false;
	private heartbeatInterval: number | null = null;
	private heartbeatTimeout: number | null = null;
	private lastHeartbeatResponse: number = 0;
	private connectionTimeout: number | null = null;
	private isWebSocketReady: boolean = false;
	private isAudioReady: boolean = false;
	private resolveSessionConfiguration: (() => void) | null = null;
	private rejectSessionConfiguration: ((error: Error) => void) | null = null;
	private sessionCreated: boolean = false;
	private conversationCreated: boolean = false;
	private isPaused: boolean = false;

	aiClient!: AiClient;
	commandManager!: CommandManager;
	sessionManager!: SessionManager;
	historyManager!: HistoryManager;
	
	private updateStatusBar() {
		if (!this.statusBarItemEl) return;

		if (this.isWebSocketReady && this.isAudioReady && this.isTranscribing) {
			this.statusBarItemEl.setText(this.t('statusbar.active'));
		} else if (this.isWebSocketReady && !this.isAudioReady) {
			this.statusBarItemEl.setText(this.t('statusbar.connReady'));
		} else if (!this.isWebSocketReady && this.isAudioReady) {
			this.statusBarItemEl.setText(this.t('statusbar.audioReady'));
		} else {
			this.statusBarItemEl.setText(this.t('statusbar.wait'));
		}
	}

	async onload() {
		// 初始化国际化管理器
		this.i18nManager = I18nManager.getInstance(this.app);
		this.t = this.i18nManager.t();

		// 验证翻译完整性（开发时使用）
		if (process.env.NODE_ENV === 'development') {
			this.i18nManager.validateTranslations();
		}

		await this.loadSettings();

		const controlPanelIconEl = this.addRibbonIcon('squirrel', this.t('controlpanel.title'), (_evt: MouseEvent) => {
			try {
				const existingPanel = TranscriptionControlPanel.isControlPanelExists();
				if (existingPanel) {
					existingPanel.remove();
					this.showTranscriptionNotice(this.t('controlpanel.closed'), 'info');
				} else {
					new TranscriptionControlPanel(this).open();
					this.showTranscriptionNotice(this.t('controlpanel.opened'), 'info');
				}
			} catch (error) {
				console.error('Error handling ribbon icon click:', error);
				this.showTranscriptionNotice(this.t('controlpanel.failed'), 'error');
			}
		});
		controlPanelIconEl.addClass('speech-transcription-control-icon');

		this.statusBarItemEl = this.addStatusBarItem();
		this.isWebSocketReady = false;
		this.isAudioReady = false;
		this.updateStatusBar();
		this.addCommand({
			id: 'start-speech-transcription',
			name: this.t('command.startTranscription'),
			callback: async () => {
				await this.startTranscription();
			}
		});

		this.addCommand({
			id: 'stop-speech-transcription',
			name: this.t('command.stopTranscription'),
			callback: () => {
				this.stopTranscription();
			}
		});

		this.addCommand({
			id: 'pause-speech-transcription',
			name: this.t('command.pauseTranscription'),
			callback: () => {
				this.pauseTranscription();
			}
		});

		this.addSettingTab(new SpeechTranscriptionSettingTab(this.app, this));

		this.registerDomEvent(document, 'keydown', (evt: KeyboardEvent) => {
			if (evt.ctrlKey && evt.key === 'F9') {
				evt.preventDefault();
				this.startTranscription();
			} else if (evt.ctrlKey && evt.key === 'F10') {
				evt.preventDefault();
				this.stopTranscription();
			}
		});

		this.initializeAiSidebar();
	}

	onunload() {
		this.stopTranscription();
	}

	async startTranscription(): Promise<void> {
		if (this.isTranscribing) {
			new Notice('Speech transcription is already active');
			return;
		}

		try {
			this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });

			await this.initializeWebSocket();

			await this.initializeAudioRecording(this.mediaStream);

			this.isTranscribing = true;
			this.showTranscriptionNotice(this.t('notice.transcription.started'), 'success');

			this.updateStatusBar();

		} catch (error) {
			console.error('Failed to start transcription:', error);

			this.cleanupAudioResources();

			this.showTranscriptionNotice(this.t('notice.transcription.failed', { error: error instanceof Error ? error.message : String(error) }), 'error');
		}
	}

	stopTranscription(): void {
		if (!this.isTranscribing && !this.isPaused) {
			this.showTranscriptionNotice(this.t('notice.transcription.notActive'), 'warning');
			return;
		}

		this.stopHeartbeat();

		if (this.mediaRecorder) {
			this.mediaRecorder.disconnect();
			this.mediaRecorder = null;
		}

		if (this.audioContext) {
			this.audioContext.close();
			this.audioContext = null;
		}

		if (this.mediaStream) {
			this.mediaStream.getTracks().forEach(track => track.stop());
			this.mediaStream = null;
		}

		if (this.websocket) {
			this.websocket.close();
			this.websocket = null;
		}

		if (this.maxDurationTimeout) {
			window.clearTimeout(this.maxDurationTimeout);
			this.maxDurationTimeout = null;
		}
		if (this.connectionTimeout) {
			window.clearTimeout(this.connectionTimeout);
			this.connectionTimeout = null;
		}

		this.resolveSessionConfiguration = null;
		this.rejectSessionConfiguration = null;

		this.hasSpeechStarted = false;
		this.isTranscribing = false;
		this.isPaused = false;
		this.sessionCreated = false;
		this.conversationCreated = false;
		this.showTranscriptionNotice(this.t('notice.transcription.stopped'), 'info');

		this.isWebSocketReady = false;
		this.isAudioReady = false;

		this.updateStatusBar();
	}

	pauseTranscription(): void {
		if (!this.isTranscribing) {
			this.showTranscriptionNotice(this.t('notice.transcription.notActive'), 'warning');
			return;
		}

		if (this.mediaRecorder) {
			this.isPaused = true;
			this.showTranscriptionNotice(this.t('notice.transcription.paused'), 'warning');

			if (this.statusBarItemEl) {
				this.statusBarItemEl.setText(this.t('statusbar.paused'));
			}
		}
	}

	private async initializeWebSocket(): Promise<void> {
		return new Promise((resolve, reject) => {
			try {
				this.sessionCreated = false;
				this.conversationCreated = false;

				this.connectionTimeout = window.setTimeout(() => {
					reject(new Error('WebSocket connection timeout'));
					this.cleanupWebSocket();
				}, 15000);

				const url = new URL(this.settings.apiEndpoint);

				// Add model parameter to URL if not already present
				if (!url.searchParams.has('model')) {
					url.searchParams.append('model', 'gpt-4o-realtime-preview-2024-12-17');
				}

				// Create WebSocket with headers for authentication
				// Note: WebSocket constructor doesn't support headers directly in browsers
				// We'll use URL parameters for authentication in browser environment
				if (this.settings.apiKey) {
					url.searchParams.append('token', this.settings.apiKey);
				}

				this.websocket = new WebSocket(url.toString());

				this.websocket.onopen = () => {
					// Set WebSocket ready state
					this.isWebSocketReady = true;
					this.updateStatusBar();

					// Clear connection timeout
					if (this.connectionTimeout) {
						window.clearTimeout(this.connectionTimeout);
						this.connectionTimeout = null;
					}

					// Start heartbeat mechanism after connection is established
					this.startHeartbeat();

					// Set timeout for waiting for session and conversation creation events
					this.connectionTimeout = window.setTimeout(() => {
						if (!this.sessionCreated || !this.conversationCreated) {
							reject(new Error('Session or conversation creation timeout'));
							this.cleanupWebSocket();
						}
					}, 10000); // 10 seconds timeout for session events
				};

				this.websocket.onmessage = (event) => {
					try {
						const message = JSON.parse(event.data);

						// Handle session creation event
						if (message.type === 'session.created') {
								this.sessionCreated = true;
							this.checkSessionAndConversationReady(resolve, reject);
						}
						// Handle conversation creation event
						else if (message.type === 'conversation.created') {
								this.conversationCreated = true;
							this.checkSessionAndConversationReady(resolve, reject);
						}

						// Handle all other messages
						this.handleWebSocketMessage(event);
					} catch (error) {
						console.error('Error parsing WebSocket message during initialization:', error);
						// Don't reject immediately - could be a temporary parsing error
					}
				};

				this.websocket.onerror = (error) => {
					console.error('WebSocket error:', error);
					// Clear connection timeout on error
					if (this.connectionTimeout) {
						window.clearTimeout(this.connectionTimeout);
						this.connectionTimeout = null;
					}
					new Notice('WebSocket connection error');
					reject(error);
				};

				this.websocket.onclose = () => {
					// Stop heartbeat when connection closes
					this.stopHeartbeat();
					if (this.isTranscribing) {
						new Notice('WebSocket connection lost');
						this.stopTranscription();
					}
				};

			} catch (error) {
				reject(error);
			}
		});
	}

	private checkSessionAndConversationReady(resolve: () => void, reject: (error: Error) => void): void {
		// Only proceed if both session and conversation are created
		if (this.sessionCreated && this.conversationCreated) {
	
			// Clear the connection timeout since we received both events
			if (this.connectionTimeout) {
				window.clearTimeout(this.connectionTimeout);
				this.connectionTimeout = null;
			}

			// Now send session configuration according to standard flow
			this.sendSessionConfiguration()
				.then(() => {
					resolve();
				})
				.catch((error) => {
					console.error('Session configuration failed:', error);
					reject(error);
				});
		}
	}

	private async sendSessionConfiguration(): Promise<void> {
		return new Promise((resolve, reject) => {
			// Store promise resolvers for the session.updated event
			this.resolveSessionConfiguration = resolve;
			this.rejectSessionConfiguration = reject;

			// Set timeout for session configuration
			const configTimeout = window.setTimeout(() => {
				reject(new Error('Session configuration timeout'));
				this.resolveSessionConfiguration = null;
				this.rejectSessionConfiguration = null;
			}, 5000); // 5 seconds timeout

			// Override the resolve/reject functions to clear timeout
			const originalResolve = resolve;
			const originalReject = reject;

			this.resolveSessionConfiguration = () => {
				window.clearTimeout(configTimeout);
				originalResolve();
			};

			this.rejectSessionConfiguration = (error: Error) => {
				window.clearTimeout(configTimeout);
				originalReject(error);
			};

			const configMessage = {
				event_id: `event_${Date.now()}`,
				type: 'session.update',
				session: {
					modality: 'audio',  // Audio modality for speech transcription
					input_audio_format: {
						type: this.settings.audioFormat,  // 'pcm16' or 'pcm48'
						sample_rate: this.settings.sampleRate,  // 16000 or 48000
						channels: this.settings.channels  // 1 or 2
					},
					input_audio_transcription: {
						model: this.settings.model,
						language: this.settings.language === 'auto' ? 'auto' : this.settings.language
					},
					turn_detection: {
						type: 'server_vad',
						threshold: this.settings.vadSensitivity,
						prefix_padding_ms: 300,
						silence_duration_ms: 2000
					}
				}
			};

				this.websocket?.send(JSON.stringify(configMessage));
		});
	}

	private async initializeAudioRecording(stream: MediaStream): Promise<void> {
		// Initialize audio context for processing with specific sample rate
		this.audioContext = new AudioContext({
			sampleRate: this.settings.sampleRate
		});

		// Use Web Audio API to capture raw audio data
		const source = this.audioContext.createMediaStreamSource(stream);

		// Create script processor for real-time audio processing
		const bufferSize = 4096; // Buffer size for audio processing
		const processor = this.audioContext.createScriptProcessor(bufferSize, 1, 1);

		// Audio processing callback
		processor.onaudioprocess = (event) => {
			if (this.websocket && this.websocket.readyState === WebSocket.OPEN && this.isTranscribing && !this.isPaused) {
				const inputBuffer = event.inputBuffer;
				const inputData = inputBuffer.getChannelData(0); // Get mono channel data

				// Convert Float32Array to Int16Array (PCM16)
				const pcmData = this.floatTo16BitPCM(inputData);

				// Convert to base64 for transmission
				const base64Audio = btoa(String.fromCharCode(...pcmData));

				// Send audio data to WebSocket
				const audioMessage = {
					event_id: `event_${Date.now()}`,
					type: 'input_audio_buffer.append',
					audio: base64Audio
				};
				this.websocket.send(JSON.stringify(audioMessage));
			}
		};

		// Connect the audio processing chain
		source.connect(processor);
		processor.connect(this.audioContext.destination);

		// Store the processor for cleanup
		this.mediaRecorder = processor as any; // Reuse this property to store processor

		// Set Audio ready state
		this.isAudioReady = true;
		this.updateStatusBar();

		// Set up maximum duration protection
		//this.setupMaxDurationProtection();
	}

	private setupMaxDurationProtection(): void {
		// Set timeout for maximum audio duration
		this.maxDurationTimeout = window.setTimeout(() => {
			if (this.isTranscribing && this.websocket && this.websocket.readyState === WebSocket.OPEN) {
				// disable commit
				// this.commitAudioBuffer();

				// Reset the timeout for next segment
				this.setupMaxDurationProtection();
			}
		}, this.settings.maxAudioDuration * 1000);
	}

	private commitAudioBuffer(): void {
		if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
			const commitMessage = {
				event_id: `event_${Date.now()}`,
				type: 'input_audio_buffer.commit'
			};
			this.websocket.send(JSON.stringify(commitMessage));

			// Reset speech started flag
			this.hasSpeechStarted = false;

			// Update status
			if (this.statusBarItemEl) {
				this.statusBarItemEl.setText(this.t('statusbar.processing'));
			}
		}
	}

	private clearAudioBuffer(): void {
		if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
			const clearMessage = {
				event_id: `event_${Date.now()}`,
				type: 'input_audio_buffer.clear'
			};
			this.websocket.send(JSON.stringify(clearMessage));
		}
	}

	private floatTo16BitPCM(input: Float32Array): Uint8Array {
		// Convert Float32Array to Int16Array (PCM16)
		const output = new Int16Array(input.length);
		for (let i = 0; i < input.length; i++) {
			// Clamp to -1 to 1 range, then convert to -32768 to 32767
			const clampedValue = Math.max(-1, Math.min(1, input[i]));
			output[i] = clampedValue * 0x7FFF;
		}
		// Convert Int16Array to Uint8Array for base64 encoding
		return new Uint8Array(output.buffer);
	}

	
	private handleWebSocketMessage(event: MessageEvent): void {
		try {
			const message = JSON.parse(event.data);

			// Handle heartbeat messages
			if (message.type === 'heartbeat.pong') {
				this.updateHeartbeatResponse();
				return;
			}

			// Update heartbeat response timestamp for any received message
			this.updateHeartbeatResponse();

			// Handle session creation event (critical for proper initialization)
			if (message.type === 'session.created') {
				// Note: session.created is handled in initializeWebSocket with promise resolution
			}
			// Handle conversation creation event (critical for proper initialization)
			else if (message.type === 'conversation.created') {
				// Note: conversation.created is handled in initializeWebSocket with promise resolution
			}
			// Handle session update confirmation
			else if (message.type === 'session.updated') {
				// Session is now properly configured, can start audio recording
				this.resolveSessionConfiguration?.();
			}
			// Handle ASR transcription completion event
			else if (message.type === 'conversation.item.input_audio_transcription.completed') {
				// Extract transcription from the correct location in the event structure
				let transcription = '';
				if (message.item &&
					message.item.content &&
					message.item.content.length > 0 &&
					message.item.content[0].type === 'transcript' &&
					message.item.content[0].transcript) {
					transcription = message.item.content[0].transcript;
					//<div hidden>item_1761482938617924000</div>
					transcription = '<div hidden>' + message.item.id + '</div>   ' + transcription;
				}
				if (transcription && transcription.trim()) {
					this.insertTranscriptionText(transcription);
				}
			}
			// Handle transcription failure event
			else if (message.type === 'conversation.item.input_audio_transcription.failed') {
				console.error('Transcription failed:', message.error);
				this.showTranscriptionNotice('❌ Transcription failed: ' + message.error?.message, 'error');
			}
			// Handle speech detection events
			else if (message.type === 'input_audio_buffer.speech_started') {
				this.hasSpeechStarted = true;

				// Clear any existing max duration timeout since server VAD is working
				if (this.maxDurationTimeout) {
					window.clearTimeout(this.maxDurationTimeout);
					this.maxDurationTimeout = null;
				}

				if (this.statusBarItemEl) {
					this.statusBarItemEl.setText(this.t('statusbar.detecting'));
				}
			}
			else if (message.type === 'input_audio_buffer.speech_stopped') {
				// Commit audio buffer after speech stops (server VAD mode)
				this.commitAudioBuffer();
				// Re-enable max duration protection for next segment
				//this.setupMaxDurationProtection();
			}
			// Handle audio buffer events
			else if (message.type === 'input_audio_buffer.committed') {
				// Clear the audio buffer after successful commit (following standard flow)
				this.clearAudioBuffer();
			}
			// Handle conversation events
			else if (message.type === 'conversation.item.created') {
				// Conversation item created - no logging needed
			}
			// Handle response events - no logging needed for normal operation
			else if (message.type === 'response.created' || message.type === 'response.done') {
				// Response events - no logging needed
			}
			// Handle errors
			else if (message.type === 'error') {
				console.error('WebSocket error:', message.error);
				this.showTranscriptionNotice(this.t('notice.websocket.error', { error: message.error?.message }), 'error');
				// If session configuration fails, reject the promise
				if (this.rejectSessionConfiguration &&
					(message.error?.code === 'invalid_session_config' ||
					 message.error?.type === 'invalid_request_error')) {
					this.rejectSessionConfiguration(new Error(message.error?.message || 'Session configuration failed'));
				}
			}
			// Log unhandled event types for debugging (only for debugging purposes)
			else {
				// Silently ignore unhandled message types in production
			}
		} catch (error) {
			console.error('Error processing WebSocket message:', error);
		}
	}

	private insertTranscriptionText(text: string): void {
		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (activeView) {
			const editor = activeView.editor;
			const cursor = editor.getCursor();

			// Insert text at cursor position
			editor.replaceRange('\n'+text + ' ', cursor);

			// Move cursor to end of inserted text
			const newCursor = {
				line: cursor.line,
				ch: cursor.ch + text.length + 1
			};
			editor.setCursor(newCursor);
		} else {
			this.showTranscriptionNotice(this.t('notice.transcription.insertFailed'), 'warning');
		}
	}


	
	private startHeartbeat(): void {
		this.stopHeartbeat();
		this.lastHeartbeatResponse = Date.now();
		this.heartbeatInterval = window.setInterval(() => {
			if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
				const heartbeatMessage = {
					event_id: `heartbeat_${Date.now()}`,
					type: 'heartbeat.ping',
					heartbeat_type: HeartbeatType.PING
				};
				this.websocket.send(JSON.stringify(heartbeatMessage));

				this.heartbeatTimeout = window.setTimeout(() => {
					const timeSinceLastResponse = Date.now() - this.lastHeartbeatResponse;
					if (timeSinceLastResponse > 40000) { // 40 seconds without response
						this.showTranscriptionNotice(this.t('notice.websocket.lost'), 'warning');
						this.reconnectWebSocket();
					}
				}, 10000);
			}
		}, 30000); // 30 seconds interval
	}

	private stopHeartbeat(): void {
		if (this.heartbeatInterval) {
			window.clearInterval(this.heartbeatInterval);
			this.heartbeatInterval = null;
		}
		if (this.heartbeatTimeout) {
			window.clearTimeout(this.heartbeatTimeout);
			this.heartbeatTimeout = null;
		}
	}

	private reconnectWebSocket(): void {

		// Store current transcription state to restore later
		const wasTranscribing = this.isTranscribing;

		// Stop current connection but preserve transcription state
		this.stopHeartbeat();

		// Close WebSocket without resetting all transcription state
		if (this.websocket) {
			this.websocket.close();
			this.websocket = null;
		}

		// Clear session configuration promises
		this.resolveSessionConfiguration = null;
		this.rejectSessionConfiguration = null;

		// Reset only WebSocket-related flags
		this.isWebSocketReady = false;
		this.sessionCreated = false;
		this.conversationCreated = false;

		// Clear timeouts
		if (this.connectionTimeout) {
			window.clearTimeout(this.connectionTimeout);
			this.connectionTimeout = null;
		}

		// Attempt reconnection after 3 seconds
		setTimeout(async () => {
			try {
				await this.initializeWebSocket();

				// If transcription was active before, we need to restart audio recording
				if (wasTranscribing && this.isWebSocketReady) {
					try {
						// Clean up existing audio resources first
						this.cleanupAudioResources();

						// Request new microphone access
						this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
						await this.initializeAudioRecording(this.mediaStream);
						this.isTranscribing = true; // Restore transcription state
						this.showTranscriptionNotice(this.t('notice.websocket.reconnected'), 'success');
					} catch (audioError) {
						console.error('Failed to restart audio recording:', audioError);
						this.showTranscriptionNotice('⚠️ WebSocket reconnected but audio recording failed', 'warning');
						// Stop transcription if audio can't be restored
						this.isTranscribing = false;
						this.updateStatusBar();
					}
				} else {
					this.showTranscriptionNotice('✅ WebSocket reconnected successfully', 'success');
				}
			} catch (error) {
				console.error('WebSocket reconnection failed:', error);
				this.showTranscriptionNotice(this.t('notice.websocket.reconnectFailed'), 'error');
				// Reset transcription state if reconnection fails
				this.isTranscribing = false;
				this.cleanupAudioResources();
				this.updateStatusBar();
			}
		}, 3000);
	}

	private updateHeartbeatResponse(): void {
		this.lastHeartbeatResponse = Date.now();
	}

	isTranscriptionActive(): boolean {
		return this.isTranscribing;
	}

	isTranscriptionPaused(): boolean {
		// Use the dedicated pause flag
		return this.isPaused;
	}

	getTranscriptionStatus(): string {
		if (!this.isTranscribing) {
			return 'Ready';
		}
		if (this.isTranscriptionPaused()) {
			return 'Paused';
		}
		if (this.websocket?.readyState === WebSocket.OPEN) {
			return 'Transcribing';
		}
		return 'Connecting';
	}

	resumeTranscription(): void {
		if (this.mediaRecorder && this.isPaused) {
			this.isPaused = false;
			this.isTranscribing = true; // Resume audio processing
			this.statusBarItemEl.setText(this.t('statusbar.transcribing'));
			this.showTranscriptionNotice(this.t('notice.transcription.resumed'), 'success');
		}
	}

	private cleanupAudioResources(): void {
		if (this.mediaRecorder) {
			this.mediaRecorder.disconnect();
			this.mediaRecorder = null;
		}

		if (this.audioContext) {
			this.audioContext.close();
			this.audioContext = null;
		}

		if (this.mediaStream) {
			this.mediaStream.getTracks().forEach(track => track.stop());
			this.mediaStream = null;
		}

		this.isAudioReady = false;
	}

	private cleanupWebSocket(): void {
		this.stopHeartbeat();

		if (this.websocket) {
			this.websocket.close();
			this.websocket = null;
		}

		if (this.connectionTimeout) {
			window.clearTimeout(this.connectionTimeout);
			this.connectionTimeout = null;
		}

		this.resolveSessionConfiguration = null;
		this.rejectSessionConfiguration = null;

		this.isTranscribing = false;
		this.isPaused = false;
		this.hasSpeechStarted = false;
		this.isWebSocketReady = false;
		this.sessionCreated = false;
		this.conversationCreated = false;

		this.updateStatusBar();
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());

		// Set localized default prompts for any empty prompts
		this.setLocalizedDefaultPrompts();
	}

	/**
	 * Set localized default prompts for commands with empty prompts
	 */
	private setLocalizedDefaultPrompts(): void {
		const promptKeys = {
			'summary': 'commands.defaultPrompts.summary' as keyof TranslationKeys,
			'translate': 'commands.defaultPrompts.translate' as keyof TranslationKeys,
			'rewrite': 'commands.defaultPrompts.rewrite' as keyof TranslationKeys,
			'action-items': 'commands.defaultPrompts.actionItems' as keyof TranslationKeys
		};

		for (const [commandId, promptKey] of Object.entries(promptKeys)) {
			if (this.settings.slashCommands[commandId] && !this.settings.slashCommands[commandId].prompt) {
				this.settings.slashCommands[commandId].prompt = this.t(promptKey);
			}
		}
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	private initializeAiSidebar(): void {
		this.aiClient = new AiClient(
			this.settings.aiApiKey,
			this.settings.aiApiEndpoint,
			this.settings.aiModel
		);

		this.commandManager = new CommandManager(this.aiClient, this.app, this);
		this.sessionManager = new SessionManager();
		this.historyManager = new HistoryManager(this.settings.maxHistoryItems);

		this.commandManager.loadCommands(this.settings.slashCommands);

		this.registerAiSidebarView();

		this.addAiSidebarControls();
	}

	private registerAiSidebarView(): void {
		this.registerView(
			'ai-meeting-sidebar-view',
			(leaf) => new AiSidebarView(leaf, this)
		);
	}

	private addAiSidebarControls(): void {
		this.addCommand({
			id: 'toggle-ai-sidebar',
			name: this.t('command.toggleAiSidebar'),
			callback: () => {
				this.toggleAiSidebar();
			}
		});

		this.addCommand({
			id: 'new-ai-chat',
			name: this.t('command.newAiChat'),
			callback: () => {
				this.sessionManager?.startNewSession();
				new Notice(this.t('notice.ai.chatStarted'));
			}
		});

	}

	async toggleAiSidebar(): Promise<void> {
		try {
			const existingLeaves = this.app.workspace.getLeavesOfType('ai-meeting-sidebar-view');

			if (existingLeaves.length > 0) {
				new Notice(this.t('notice.ai.alreadyOpen'));
				return;
			}

			const rightLeaf = this.app.workspace.getRightLeaf(false);

			if (rightLeaf) {
				await rightLeaf.setViewState({
					type: 'ai-meeting-sidebar-view',
					active: true,
				});
				this.app.workspace.revealLeaf(rightLeaf);
				new Notice(this.t('notice.ai.opened'));
			} else {
				const newRightLeaf = this.app.workspace.getRightLeaf(true);
				if (newRightLeaf) {
					await newRightLeaf.setViewState({
						type: 'ai-meeting-sidebar-view',
						active: true,
					});
					this.app.workspace.revealLeaf(newRightLeaf);
					new Notice(this.t('notice.ai.opened'));
				} else {
					new Notice('❌ Failed to create AI sidebar');
				}
			}
		} catch (error) {
			console.error('Error toggling AI sidebar:', error);
			new Notice(this.t('notice.ai.failed', { error: error instanceof Error ? error.message : String(error) }));
		}
	}

	updateAiConfig(): void {
		if (this.aiClient) {
			this.aiClient.updateConfig(
				this.settings.aiApiKey,
				this.settings.aiApiEndpoint,
				this.settings.aiModel
			);
		}

		if (this.commandManager) {
			this.commandManager.loadCommands(this.settings.slashCommands);
		}

		if (this.historyManager) {
			this.historyManager.updateMaxItems(this.settings.maxHistoryItems);
		}
	}

	private showTranscriptionNotice(message: string, type: 'success' | 'error' | 'warning' | 'info' = 'info'): void {
		const icon = this.getNoticeIcon(type);
		const styledMessage = `${icon} ｜  ${message} `;

		new Notice(styledMessage, 5000);
	}


	private getNoticeIcon(type: 'success' | 'error' | 'warning' | 'info'): string {
		const icons: Record<string, string> = {
			success: '✅',
			error: '❌',
			warning: '⚠️',
			info: 'ℹ️'
		};
		return icons[type] || icons.info;
	}
}

class SpeechTranscriptionSettingTab extends PluginSettingTab {
	plugin: AiMeetingSidebarPlugin;
	private t: TranslateFunction;

	constructor(app: App, plugin: AiMeetingSidebarPlugin) {
		super(app, plugin);
		this.plugin = plugin;
		this.t = plugin.t;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();
		containerEl.addClass('ai-meeting-settings-container');

		// Create main sections with better organization
		this.createSettingsHeader(containerEl);
		this.createSpeechSettingsSection(containerEl);
		this.createAISettingsSection(containerEl);
		this.createCommandsSettingsSection(containerEl);
		this.createFooterInfo(containerEl);
	}

	private createSettingsHeader(containerEl: HTMLElement): void {
		const headerEl = containerEl.createDiv('settings-header');

		const titleEl = headerEl.createEl('h1', {
			text: this.t('plugin.name') + ' ' + this.t('common.settings')
		});
		titleEl.addClass('settings-main-title');

		const descEl = headerEl.createEl('p', {
			text: this.t('plugin.description')
		});
		descEl.addClass('settings-description');
	}

	private createSpeechSettingsSection(containerEl: HTMLElement): void {
		const sectionEl = containerEl.createDiv('settings-section');
		sectionEl.addClass('speech-settings-section');

		const sectionHeader = sectionEl.createDiv('section-header');
		sectionHeader.createEl('h2', { text: this.t('settings.speech.title') });
		sectionHeader.createEl('p', {
			text: this.t('settings.speech.instructions')
		}).addClass('section-description');

		const settingsGroup = sectionEl.createDiv('settings-group');

		// API Configuration Group
		this.createSettingGroup(settingsGroup, 'API Configuration', [
			{
				name: this.t('settings.speech.apiEndpoint'),
				desc: this.t('settings.speech.apiEndpoint.desc'),
				type: 'text',
				placeholder: 'wss://your-api-server/v1/realtime',
				value: this.plugin.settings.apiEndpoint,
				onChange: async (value: string) => {
					this.plugin.settings.apiEndpoint = value;
					await this.plugin.saveSettings();
				}
			},
			{
				name: this.t('settings.speech.apiKey'),
				desc: this.t('settings.speech.apiKey.desc'),
				type: 'password',
				placeholder: 'Enter your API key',
				value: this.plugin.settings.apiKey,
				onChange: async (value: string) => {
					this.plugin.settings.apiKey = value;
					await this.plugin.saveSettings();
				}
			}
		]);

		// Audio Configuration Group
		this.createSettingGroup(settingsGroup, 'Audio Configuration', [
			{
				name: this.t('settings.speech.model'),
				desc: this.t('settings.speech.model.desc'),
				type: 'text',
				placeholder: 'whisper-1',
				value: this.plugin.settings.model,
				onChange: async (value: string) => {
					this.plugin.settings.model = value;
					await this.plugin.saveSettings();
				}
			},
			{
				name: this.t('settings.speech.language'),
				desc: this.t('settings.speech.language.desc'),
				type: 'text',
				placeholder: 'en',
				value: this.plugin.settings.language,
				onChange: async (value: string) => {
					this.plugin.settings.language = value;
					await this.plugin.saveSettings();
				}
		},
			{
				name: this.t('settings.speech.audioFormat'),
				desc: this.t('settings.speech.audioFormat.desc'),
				type: 'dropdown',
				options: [
					{ value: 'pcm16', label: 'PCM16 (16 kHz)' },
					{ value: 'pcm48', label: 'PCM48 (48 kHz)' }
				],
				value: this.plugin.settings.audioFormat,
				onChange: async (value: string) => {
					this.plugin.settings.audioFormat = value;
					// Auto-update sample rate
					if (value === 'pcm16') {
						this.plugin.settings.sampleRate = 16000;
					} else if (value === 'pcm48') {
						this.plugin.settings.sampleRate = 48000;
					}
					await this.plugin.saveSettings();
				}
			},
			{
				name: this.t('settings.speech.sampleRate'),
				desc: this.t('settings.speech.sampleRate.desc'),
				type: 'readonly',
				value: this.plugin.settings.sampleRate.toString() + ' Hz'
			},
			{
				name: this.t('settings.speech.channels'),
				desc: this.t('settings.speech.channels.desc'),
				type: 'number',
				placeholder: '1',
				value: this.plugin.settings.channels.toString(),
				onChange: async (value: string) => {
					const numValue = parseInt(value);
					if (!isNaN(numValue) && numValue > 0) {
						this.plugin.settings.channels = numValue;
						await this.plugin.saveSettings();
					}
				}
			}
		]);

		// Advanced Settings Group
		this.createSettingGroup(settingsGroup, 'Advanced Settings', [
			{
				name: this.t('settings.speech.vadSensitivity'),
				desc: this.t('settings.speech.vadSensitivity.desc'),
				type: 'slider',
				min: 0,
				max: 1,
				step: 0.1,
				value: this.plugin.settings.vadSensitivity,
				onChange: async (value: number) => {
					this.plugin.settings.vadSensitivity = value;
					await this.plugin.saveSettings();
				}
			},
			{
				name: this.t('settings.speech.maxDuration'),
				desc: this.t('settings.speech.maxDuration.desc'),
				type: 'number',
				placeholder: '10',
				value: this.plugin.settings.maxAudioDuration.toString(),
				onChange: async (value: string) => {
					const numValue = parseInt(value);
					if (!isNaN(numValue) && numValue > 0) {
						this.plugin.settings.maxAudioDuration = numValue;
						await this.plugin.saveSettings();
					}
				}
			}
		]);

		// Add info box
		this.createInfoBox(settingsGroup, '💡 ' + this.t('settings.speech.keyboardShortcuts'));
	}

	private createAISettingsSection(containerEl: HTMLElement): void {
		const sectionEl = containerEl.createDiv('settings-section');
		sectionEl.addClass('ai-settings-section');

		const sectionHeader = sectionEl.createDiv('section-header');
		sectionHeader.createEl('h2', { text: this.t('settings.ai.title') });
		sectionHeader.createEl('p', {
			text: this.t('settings.ai.enableSidebar.desc')
		}).addClass('section-description');

		const settingsGroup = sectionEl.createDiv('settings-group');

		// AI Configuration Group
		this.createSettingGroup(settingsGroup, 'AI Configuration', [
			{
				name: this.t('settings.ai.enableSidebar'),
				desc: this.t('settings.ai.enableSidebar.desc'),
				type: 'toggle',
				value: this.plugin.settings.enableAiSidebar,
				onChange: async (value: boolean) => {
					this.plugin.settings.enableAiSidebar = value;
					await this.plugin.saveSettings();
				}
			},
			{
				name: this.t('settings.ai.apiEndpoint'),
				desc: this.t('settings.ai.apiEndpoint.desc'),
				type: 'text',
				placeholder: 'https://api.openai.com/v1/chat/completions',
				value: this.plugin.settings.aiApiEndpoint,
				onChange: async (value: string) => {
					this.plugin.settings.aiApiEndpoint = value;
					await this.plugin.saveSettings();
					this.plugin.updateAiConfig();
				}
			},
			{
				name: this.t('settings.ai.apiKey'),
				desc: this.t('settings.ai.apiKey.desc'),
				type: 'password',
				placeholder: this.t('placeholder.apiKey'),
				value: this.plugin.settings.aiApiKey,
				onChange: async (value: string) => {
					this.plugin.settings.aiApiKey = value;
					await this.plugin.saveSettings();
					this.plugin.updateAiConfig();
				}
			},
			{
				name: this.t('settings.ai.model'),
				desc: this.t('settings.ai.model.desc'),
				type: 'text',
				placeholder: 'gpt-3.5-turbo',
				value: this.plugin.settings.aiModel,
				onChange: async (value: string) => {
					this.plugin.settings.aiModel = value;
					await this.plugin.saveSettings();
					this.plugin.updateAiConfig();
				}
			}
		]);

		// Memory & History Group
		this.createSettingGroup(settingsGroup, 'Memory & History', [
			{
				name: this.t('settings.ai.maxHistory'),
				desc: this.t('settings.ai.maxHistory.desc'),
				type: 'slider',
				min: 10,
				max: 200,
				step: 10,
				value: this.plugin.settings.maxHistoryItems,
				onChange: async (value: number) => {
					this.plugin.settings.maxHistoryItems = value;
					await this.plugin.saveSettings();
					this.plugin.updateAiConfig();
				}
			},
			{
				name: this.t('settings.ai.maxConversationHistory'),
				desc: this.t('settings.ai.maxConversationHistory.desc'),
				type: 'slider',
				min: 1,
				max: 50,
				step: 1,
				value: this.plugin.settings.maxConversationHistory,
				onChange: async (value: number) => {
					this.plugin.settings.maxConversationHistory = value;
					await this.plugin.saveSettings();
				}
			}
		]);

		// Connection Test
		this.createConnectionTest(settingsGroup);
	}

	private createCommandsSettingsSection(containerEl: HTMLElement): void {
		const sectionEl = containerEl.createDiv('settings-section');
		sectionEl.addClass('commands-settings-section');

		const sectionHeader = sectionEl.createDiv('section-header');
		sectionHeader.createEl('h2', { text: this.t('settings.commands.title') });
		sectionHeader.createEl('p', {
			text: this.t('settings.commands.addCustom.desc')
		}).addClass('section-description');

		const settingsGroup = sectionEl.createDiv('settings-group');

		// Command aliases info
		this.createCommandAliasesInfo(settingsGroup);

		// Commands list
		this.createCommandsList(settingsGroup);

		// Add custom command button
		this.createAddCommandButton(settingsGroup);

		// Tip
		this.createInfoBox(settingsGroup, '💡 ' + this.t('settings.commands.tip'));
	}

	private createSettingGroup(container: HTMLElement, title: string, settings: any[]): void {
		const groupEl = container.createDiv('setting-group');
		groupEl.addClass('collapsible-group');

		const groupHeader = groupEl.createDiv('setting-group-header');

		const headerContent = groupHeader.createDiv('setting-group-header-content');
		const titleEl = headerContent.createEl('h3', { text: title });

		const expandedText = this.plugin.settings.language === 'zh' || this.plugin.settings.language === 'zh-CN' ? '展开' : 'Expanded';
		const collapsedText = this.plugin.settings.language === 'zh' || this.plugin.settings.language === 'zh-CN' ? '收起' : 'Collapsed';

		const statusEl = headerContent.createEl('span', {
			text: `(${settings.length} ${this.t('common.settings')} - ${expandedText})`,
			cls: 'setting-group-status'
		});

		const groupContent = groupEl.createDiv('setting-group-content');

		settings.forEach(setting => {
			this.createSettingItem(groupContent, setting);
		});

		// Add collapsible functionality - start collapsed by default
		let isExpanded = false;

		// Initialize collapsed state
		groupHeader.classList.add('collapsed');
		groupContent.style.display = 'none';
		statusEl.textContent = `(${settings.length} ${this.t('common.settings')} - ${collapsedText})`;

		groupHeader.addEventListener('click', () => {
			isExpanded = !isExpanded;
			if (isExpanded) {
				groupHeader.classList.remove('collapsed');
				groupContent.style.display = 'block';
				statusEl.textContent = `(${settings.length} ${this.t('common.settings')} - ${expandedText})`;
			} else {
				groupHeader.classList.add('collapsed');
				groupContent.style.display = 'none';
				statusEl.textContent = `(${settings.length} ${this.t('common.settings')} - ${collapsedText})`;
			}
		});
	}

	private createSettingItem(container: HTMLElement, setting: any): void {
		const settingEl = new Setting(container);

		settingEl.setName(setting.name);
		if (setting.desc) {
			settingEl.setDesc(setting.desc);
		}

		switch (setting.type) {
			case 'text':
			case 'password':
				settingEl.addText(text => {
					if (setting.type === 'password') {
						text.inputEl.type = 'password';
					}
					if (setting.placeholder) {
						text.setPlaceholder(setting.placeholder);
					}
					text.setValue(setting.value);
					text.onChange(async (value) => {
						await setting.onChange(value);
					});
				});
				break;

			case 'number':
				settingEl.addText(text => {
					text.inputEl.type = 'number';
					if (setting.placeholder) {
						text.setPlaceholder(setting.placeholder);
					}
					text.setValue(setting.value);
					text.onChange(async (value) => {
						await setting.onChange(value);
					});
				});
				break;

			case 'dropdown':
				settingEl.addDropdown(dropdown => {
					setting.options?.forEach((option: any) => {
						dropdown.addOption(option.value, option.label);
					});
					dropdown.setValue(setting.value);
					dropdown.onChange(async (value) => {
						await setting.onChange(value);
					});
				});
				break;

			case 'toggle':
				settingEl.addToggle(toggle => {
					toggle.setValue(setting.value);
					toggle.onChange(async (value) => {
						await setting.onChange(value);
					});
				});
				break;

			case 'slider':
				settingEl.addSlider(slider => {
					slider.setLimits(setting.min, setting.max, setting.step);
					slider.setValue(setting.value);
					slider.setDynamicTooltip();
					slider.onChange(async (value) => {
						await setting.onChange(value);
					});
				});
				break;

			case 'readonly':
				settingEl.addText(text => {
					text.setValue(setting.value);
					text.setDisabled(true);
				});
				break;
		}
	}

	private createInfoBox(container: HTMLElement, text: string): void {
		const infoEl = container.createDiv('setting-item-info');
		infoEl.createEl('p', { text });
	}

	private createConnectionTest(container: HTMLElement): void {
		const testGroup = container.createDiv('setting-group');
		testGroup.addClass('connection-test-group');

		const testSetting = new Setting(testGroup);
		testSetting.setName(this.t('settings.ai.testConnection'));
		testSetting.setDesc(this.t('settings.ai.testConnection.desc'));
		testSetting.addButton(button => {
			button.setButtonText(this.t('common.test'));
			button.onClick(async () => {
				button.setDisabled(true);
				button.setButtonText(this.t('common.loading') + '...');

				try {
					const success = await this.plugin.aiClient.testConnection();
					if (success) {
						new Notice(this.t('notice.connection.testSuccess'));
					} else {
						new Notice(this.t('notice.connection.testFailed'));
					}
				} catch (error) {
					new Notice(this.t('notice.connection.testFailed') + ': ' + (error instanceof Error ? error.message : String(error)));
				} finally {
					button.setDisabled(false);
					button.setButtonText(this.t('common.test'));
				}
			});
		});
	}

	private createCommandAliasesInfo(container: HTMLElement): void {
		const aliasInfo = container.createDiv('command-aliases-info');
		aliasInfo.createEl('h4', { text: this.t('settings.commands.aliasInfo') });

		const aliasGrid = aliasInfo.createDiv('alias-grid');
		const builtInAliases = [
			{ cmd: '/summary', alias: '/su', desc: this.t('command.summary.name') },
			{ cmd: '/translate', alias: '/tr', desc: this.t('command.translate.name') },
			{ cmd: '/rewrite', alias: '/rw', desc: this.t('command.rewrite.name') },
			{ cmd: '/action-items', alias: '/ai', desc: this.t('command.actionItems.name') },
			{ cmd: '/clear', alias: '/cl', desc: this.t('command.clear.name') },
			{ cmd: '/help', alias: '/h', desc: this.t('command.help.name') }
		];

		builtInAliases.forEach(item => {
			const aliasCard = aliasGrid.createDiv('alias-card');
			aliasCard.createEl('span', { text: item.cmd, cls: 'command-name' });
			aliasCard.createEl('span', { text: '→' });
			aliasCard.createEl('span', { text: item.alias, cls: 'command-alias' });
			aliasCard.createEl('span', { text: item.desc, cls: 'command-desc' });
		});
	}

	private createCommandsList(container: HTMLElement): void {
		const commandsContainer = container.createDiv('commands-list');
		const builtInCommands = ['summary', 'translate', 'rewrite', 'action-items'];

		// Separate built-in and custom commands
		const builtInConfigs: { [key: string]: any } = {};
		const customConfigs: { [key: string]: any } = {};

		for (const [commandId, config] of Object.entries(this.plugin.settings.slashCommands)) {
			if (builtInCommands.includes(commandId)) {
				builtInConfigs[commandId] = config;
			} else {
				customConfigs[commandId] = config;
			}
		}

		// Create built-in commands group
		if (Object.keys(builtInConfigs).length > 0) {
			this.createCollapsibleCommandsGroup(commandsContainer, this.t('settings.commands.builtIn'), builtInConfigs, false);
		}

		// Create custom commands group
		if (Object.keys(customConfigs).length > 0) {
			this.createCollapsibleCommandsGroup(commandsContainer, this.t('settings.commands.custom'), customConfigs, true);
		}
	}

	
	private createCollapsibleCommandsGroup(container: HTMLElement, groupTitle: string, commands: { [key: string]: any }, allowDelete: boolean): void {
		const groupEl = container.createDiv('setting-group');
		groupEl.addClass('collapsible-group');

		const groupHeader = groupEl.createDiv('setting-group-header');

		const headerContent = groupHeader.createDiv('setting-group-header-content');
		const titleEl = headerContent.createEl('h3', { text: groupTitle });

		const expandedText = this.plugin.settings.language === 'zh' || this.plugin.settings.language === 'zh-CN' ? '展开' : 'Expanded';
		const collapsedText = this.plugin.settings.language === 'zh' || this.plugin.settings.language === 'zh-CN' ? '收起' : 'Collapsed';

		const statusEl = headerContent.createEl('span', {
			text: `(${Object.keys(commands).length} 个命令 - ${expandedText})`,
			cls: 'setting-group-status'
		});

		const groupContent = groupEl.createDiv('setting-group-content');

		const builtInCommands = ['summary', 'translate', 'rewrite', 'action-items'];

		for (const [commandId, config] of Object.entries(commands)) {
			const commandCard = groupContent.createDiv('command-card');

			const commandHeader = commandCard.createDiv('command-header');

			// Left side: Command name only
			const headerLeft = commandHeader.createDiv('command-header-left');

			let commandName = `/${commandId}`;
			if (config.name && config.name !== commandId) {
				commandName += ` - ${config.name}`;
			}
			if (config.alias) {
				commandName += ` (${this.t('settings.commands.alias', { alias: config.alias })})`;
			}

			const nameContainer = headerLeft.createDiv('command-name-container');
			nameContainer.createEl('h4', { text: commandName });

			// Right side: Toggle switch and buttons
			const headerRight = commandHeader.createDiv('command-header-right');

			// Toggle switch (without label)
			const toggle = headerRight.createEl('div', { cls: 'toggle-switch' });
			const toggleInput = toggle.createEl('input', {
				type: 'checkbox',
				cls: 'toggle-input'
			});
			const toggleSlider = toggle.createEl('div', { cls: 'toggle-slider' });

			toggleInput.checked = config.enabled;
			toggleInput.addEventListener('change', async () => {
				this.plugin.settings.slashCommands[commandId].enabled = toggleInput.checked;
				if (toggleInput.checked) {
					toggle.classList.add('toggle-on');
				} else {
					toggle.classList.remove('toggle-on');
				}
				await this.plugin.saveSettings();
				this.plugin.updateAiConfig();
			});

			// Initialize toggle state
			if (toggleInput.checked) {
				toggle.classList.add('toggle-on');
			}

			// Edit button
			const editBtn = headerRight.createEl('button', {
				text: this.t('common.edit'),
				cls: 'command-edit-button'
			});
			editBtn.addEventListener('click', () => {
				this.editCommand(commandId, config);
			});

			// Delete button (for custom commands only)
			if (allowDelete && !builtInCommands.includes(commandId)) {
				const deleteBtn = headerRight.createEl('button', {
					text: this.t('common.delete'),
					cls: 'command-delete-button'
				});
				deleteBtn.addEventListener('click', () => {
					this.deleteCommand(commandId);
				});
			}

			const commandDesc = commandCard.createDiv('command-description');
			commandDesc.createEl('p', {
				text: this.t('settings.commands.promptDesc', { prompt: config.prompt.substring(0, 100) })
			});
		}

		// Add collapsible functionality - start collapsed by default
		let isExpanded = false;

		// Initialize collapsed state
		groupHeader.classList.add('collapsed');
		groupContent.style.display = 'none';
		statusEl.textContent = `(${Object.keys(commands).length} 个命令 - ${collapsedText})`;

		groupHeader.addEventListener('click', () => {
			isExpanded = !isExpanded;
			if (isExpanded) {
				groupHeader.classList.remove('collapsed');
				groupContent.style.display = 'block';
				statusEl.textContent = `(${Object.keys(commands).length} 个命令 - ${expandedText})`;
			} else {
				groupHeader.classList.add('collapsed');
				groupContent.style.display = 'none';
				statusEl.textContent = `(${Object.keys(commands).length} 个命令 - ${collapsedText})`;
			}
		});
	}

	private createAddCommandButton(container: HTMLElement): void {
		const addGroup = container.createDiv('add-command-group');

		const addSetting = new Setting(addGroup);
		addSetting.setName(this.t('settings.commands.addCustom'));
		addSetting.setDesc(this.t('settings.commands.addCustom.desc'));
		addSetting.addButton(button => {
			button.setButtonText(this.t('common.add'));
			button.onClick(() => {
				this.addCustomCommand();
			});
		});
	}

	private createFooterInfo(container: HTMLElement): void {
		const footerEl = container.createDiv('settings-footer');
		footerEl.createEl('p', { text: '© 2024 ' + this.t('plugin.author') + '. ' + this.t('plugin.description') });
	}

	private editCommand(commandId: string, config: any): void {
		// 获取当前生效的提示词：如果配置中的提示词为空，则使用动态设置的默认提示词
		const effectivePrompt = config.prompt && config.prompt.trim() !== ''
			? config.prompt
			: this.getCurrentEffectivePrompt(commandId);

		const configWithPrompt = {
			...config,
			prompt: effectivePrompt,
			name: config.name || commandId // 确保名称不为空
		};

		const modal = new CommandEditModal(this.app, commandId, configWithPrompt, async (updatedConfig) => {
			this.plugin.settings.slashCommands[commandId] = updatedConfig;
			await this.plugin.saveSettings();
			this.plugin.updateAiConfig();
			this.display();
		}, this.t);
		modal.open();
	}

	private getCurrentEffectivePrompt(commandId: string): string {
		// 获取当前生效的提示词，包括动态设置的默认值
		const config = this.plugin.settings.slashCommands[commandId];
		if (config && config.prompt && config.prompt.trim() !== '') {
			return config.prompt;
		}

		// 如果配置中的提示词为空，返回动态设置的默认提示词
		const promptKeys: { [key: string]: keyof TranslationKeys } = {
			'summary': 'commands.defaultPrompts.summary',
			'translate': 'commands.defaultPrompts.translate',
			'rewrite': 'commands.defaultPrompts.rewrite',
			'action-items': 'commands.defaultPrompts.actionItems'
		};

		const promptKey = promptKeys[commandId];
		const defaultPrompt = promptKey ? this.t(promptKey) : this.t('commands.defaultPrompts.generic');

		return defaultPrompt;
	}


	private addCustomCommand(): void {
		const modal = new CommandEditModal(this.app, '', {
			name: this.t('command.edit.addTitle'),
			prompt: this.t('commands.defaultPrompts.generic'),
			enabled: true
		}, async (config) => {
			// 生成新的命令ID - 优化生成逻辑，避免多余的连字符
			const commandId = config.name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/^-+|-+$/g, '');

			// 检查是否已存在
			if (this.plugin.settings.slashCommands[commandId]) {
				new Notice(this.t('command.edit.exists'));
				return;
			}

			this.plugin.settings.slashCommands[commandId] = config;
			await this.plugin.saveSettings();
			this.plugin.updateAiConfig();
			this.display(); // 刷新设置页面
			new Notice(this.t('command.edit.added'));
		}, this.t);
		modal.open();
	}

	private deleteCommand(commandId: string): void {
		// 定义内置命令列表
		const builtInCommands = ['summary', 'translate', 'rewrite', 'action-items'];

		// 防止删除内置命令
		if (builtInCommands.includes(commandId)) {
			new Notice(this.t('command.delete.builtInError'));
			return;
		}

		// 确认删除
		const confirmMessage = this.t('command.delete.confirm', { command: commandId });
		if (confirm(confirmMessage)) {
			// 删除命令
			delete this.plugin.settings.slashCommands[commandId];
			this.plugin.saveSettings();
			this.plugin.updateAiConfig();
			this.display(); // 刷新设置页面
			new Notice(this.t('command.delete.success', { command: commandId }));
		}
	}
}

// 命令编辑模态框
class CommandEditModal extends Modal {
	private commandId: string;
	private config: any;
	private onSave: (config: any) => void;
	private t: TranslateFunction;
	private nameInput!: HTMLInputElement;
	private promptInput!: HTMLTextAreaElement;
	private aliasInput!: HTMLInputElement;
	private enabledToggle!: HTMLInputElement;

	constructor(app: App, commandId: string, config: any, onSave: (config: any) => void, t: TranslateFunction) {
		super(app);
		this.commandId = commandId;
		this.config = { ...config }; // 深拷贝
		this.onSave = onSave;
		this.t = t;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		// Add modal container class
		this.modalEl.classList.add('command-edit-modal');

		// Create modal content wrapper
		const modalContent = contentEl.createDiv('modal-content');

		// Create modal header
		const modalHeader = modalContent.createDiv('modal-header');
		const modalTitle = modalHeader.createEl('h2', { cls: 'modal-title' });

		// Add icon to title
		const titleIcon = modalTitle.createDiv('modal-title-icon');
		titleIcon.innerHTML = this.commandId ? '✏️' : '➕';

		const titleText = modalTitle.createSpan('modal-title-text');
		titleText.textContent = this.commandId ? this.t('command.edit.title') : this.t('command.edit.addTitle');

		// Create modal body
		const modalBody = modalContent.createDiv('modal-body');

		// Command name field
		const nameGroup = modalBody.createDiv('form-group');
		const nameLabel = nameGroup.createDiv('form-label');
		const nameLabelSpan = nameLabel.createSpan('form-label-text');
		nameLabelSpan.textContent = this.t('command.edit.name');

		// Add info icon with tooltip
		const nameInfoIcon = nameLabel.createSpan('info-icon');
		nameInfoIcon.textContent = 'i';
		nameInfoIcon.title = this.t('command.edit.name') || 'Enter a descriptive name for this command';

		this.nameInput = nameGroup.createEl('input', {
			type: 'text',
			value: this.config.name,
			cls: 'form-input',
			placeholder: 'e.g., Summarize text'
		});

		// Prompt field
		const promptGroup = modalBody.createDiv('form-group');
		const promptLabel = promptGroup.createDiv('form-label');
		const promptLabelSpan = promptLabel.createSpan('form-label-text');
		promptLabelSpan.textContent = this.t('command.edit.prompt');

		// Add info icon with tooltip
		const promptInfoIcon = promptLabel.createSpan('info-icon');
		promptInfoIcon.textContent = 'i';
		promptInfoIcon.title = 'The AI prompt that will be used for this command';

		this.promptInput = promptGroup.createEl('textarea', {
			cls: 'form-textarea',
			placeholder: 'Enter the AI prompt here...'
		});
		// Explicitly set textarea value
		this.promptInput.value = this.config.prompt;

		// Command alias field
		const aliasGroup = modalBody.createDiv('form-group');
		const aliasLabel = aliasGroup.createDiv('form-label');
		const aliasLabelSpan = aliasLabel.createSpan('form-label-text');
		aliasLabelSpan.textContent = this.t('command.edit.alias');

		// Add info icon with tooltip
		const aliasInfoIcon = aliasLabel.createSpan('info-icon');
		aliasInfoIcon.textContent = 'i';
		aliasInfoIcon.title = 'Optional shortcut alias for this command';

		this.aliasInput = aliasGroup.createEl('input', {
			type: 'text',
			value: this.config.alias || '',
			cls: 'form-input',
			placeholder: this.t('command.edit.alias.placeholder') || 'e.g., summarize'
		});

		// Enabled toggle
		const toggleGroup = modalBody.createDiv('toggle-group');
		const toggleLabel = toggleGroup.createDiv('toggle-label');
		toggleLabel.textContent = this.t('command.edit.enabled');

		const modernToggle = toggleGroup.createDiv('modern-toggle');
		this.enabledToggle = modernToggle.createEl('input', {
			type: 'checkbox'
		});
		this.enabledToggle.checked = this.config.enabled;

		const toggleSlider = modernToggle.createDiv('modern-toggle-slider');

		// Add toggle interaction
		modernToggle.addEventListener('click', () => {
			this.enabledToggle.checked = !this.enabledToggle.checked;
			this.updateToggleState(modernToggle);
		});

		this.enabledToggle.addEventListener('change', () => {
			this.updateToggleState(modernToggle);
		});

		// Set initial toggle state
		this.updateToggleState(modernToggle);

		// Help tip
		const infoTip = modalBody.createDiv('info-tip');
		const infoTipIcon = infoTip.createDiv('info-tip-icon');
		infoTipIcon.innerHTML = '💡';
		const infoTipText = infoTip.createDiv();
		infoTipText.textContent = this.t('command.edit.tip');

		// Create modal footer
		const modalFooter = modalContent.createDiv('modal-footer');

		// Cancel button
		const cancelButton = modalFooter.createEl('button', {
			text: this.t('common.cancel'),
			cls: 'btn btn-cancel'
		});
		cancelButton.addEventListener('click', () => this.close());

		// Save button
		const saveButton = modalFooter.createEl('button', {
			text: this.t('common.save'),
			cls: 'btn btn-save'
		});
		saveButton.addEventListener('click', () => {
			this.save();
		});

		// Focus management - set focus to first input
		setTimeout(() => {
			this.nameInput.focus();
		}, 100);

		// Add keyboard navigation
		this.setupKeyboardNavigation(cancelButton, saveButton);
	}

	private updateToggleState(toggleElement: HTMLElement) {
		if (this.enabledToggle.checked) {
			toggleElement.classList.add('toggle-on');
		} else {
			toggleElement.classList.remove('toggle-on');
		}
	}

	private setupKeyboardNavigation(cancelButton: HTMLButtonElement, saveButton: HTMLButtonElement) {
		this.modalEl.addEventListener('keydown', (e) => {
			if (e.key === 'Escape') {
				this.close();
			} else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
				e.preventDefault();
				saveButton.click();
			}
		});

		// Tab navigation between form fields
		const focusableElements = [
			this.nameInput,
			this.promptInput,
			this.aliasInput,
			this.enabledToggle,
			cancelButton,
			saveButton
		];

		focusableElements.forEach((element, index) => {
			element.addEventListener('keydown', (e: KeyboardEvent) => {
				if (e.key === 'Tab' && !e.shiftKey && index < focusableElements.length - 1) {
					e.preventDefault();
					focusableElements[index + 1].focus();
				} else if (e.key === 'Tab' && e.shiftKey && index > 0) {
					e.preventDefault();
					focusableElements[index - 1].focus();
				}
			});
		});
	}

	private save(): void {
		const aliasValue = this.aliasInput.value.trim();
		const updatedConfig = {
			name: this.nameInput.value.trim(),
			prompt: this.promptInput.value.trim(),
			enabled: this.enabledToggle.checked,
			alias: aliasValue || undefined // 只在非空时保存别名
		};

		if (!updatedConfig.name) {
			new Notice(this.t('command.edit.emptyName'));
			return;
		}

		if (!updatedConfig.prompt) {
			new Notice(this.t('command.edit.emptyPrompt'));
			return;
		}

		// 验证别名格式（如果提供）
		if (updatedConfig.alias && !/^[a-zA-Z0-9\-]+$/.test(updatedConfig.alias)) {
			new Notice(this.t('command.edit.invalidAlias'));
			return;
		}

		this.onSave(updatedConfig);
		this.close();
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

// Control Panel for Transcription Controls
class TranscriptionControlPanel {
	private plugin: AiMeetingSidebarPlugin;
	private containerEl!: HTMLElement;
	private startButton!: HTMLButtonElement;
	private pauseButton!: HTMLButtonElement;
	private stopButton!: HTMLButtonElement;
	private updateInterval: number | null = null;
	private isDragging: boolean = false;
	private dragStartX: number = 0;
	private dragStartY: number = 0;
	private initialLeft: number = 0;
	private initialTop: number = 0;

	constructor(plugin: AiMeetingSidebarPlugin) {
		this.plugin = plugin;
		this.containerEl = document.createElement('div');
		this.containerEl.addClass('transcription-control-panel');
		this.containerEl.setAttribute('id', 'speech-transcription-control-panel');

		// Add drag functionality
		this.setupDragHandlers();
	}

	private t(key: keyof TranslationKeys): string {
		return this.plugin.t(key);
	}

	private setupDragHandlers() {
		// Make the control panel draggable
		this.containerEl.style.cursor = 'move';

		// Mouse down event - start dragging
		this.containerEl.addEventListener('mousedown', (e) => {
			// Only start dragging if clicking on the panel itself, not buttons
			if (e.target === this.containerEl || e.target === this.containerEl.querySelector('.button-container')) {
				this.startDrag(e.clientX, e.clientY);
			}
		});

		// Mouse move event - handle dragging
		document.addEventListener('mousemove', (e) => {
			if (this.isDragging) {
				this.handleDrag(e.clientX, e.clientY);
			}
		});

		// Mouse up event - stop dragging
		document.addEventListener('mouseup', () => {
			if (this.isDragging) {
				this.stopDrag();
			}
		});

		// Prevent text selection while dragging
		this.containerEl.addEventListener('selectstart', (e) => {
			if (this.isDragging) {
				e.preventDefault();
			}
		});
	}

	private startDrag(clientX: number, clientY: number) {
		this.isDragging = true;
		this.dragStartX = clientX;
		this.dragStartY = clientY;

		// Get current position
		const rect = this.containerEl.getBoundingClientRect();
		this.initialLeft = rect.left;
		this.initialTop = rect.top;

		// Remove CSS positioning constraints for dragging
		this.containerEl.style.left = `${this.initialLeft}px`;
		this.containerEl.style.top = `${this.initialTop}px`;
		this.containerEl.style.transform = 'none';

		// Add dragging style
		this.containerEl.style.opacity = '0.8';
		this.containerEl.style.zIndex = '1001';
	}

	private handleDrag(clientX: number, clientY: number) {
		if (!this.isDragging) return;

		const deltaX = clientX - this.dragStartX;
		const deltaY = clientY - this.dragStartY;

		const newLeft = this.initialLeft + deltaX;
		const newTop = this.initialTop + deltaY;

		// Update position
		this.containerEl.style.left = `${newLeft}px`;
		this.containerEl.style.top = `${newTop}px`;
		this.containerEl.style.transform = 'none';
	}

	private stopDrag() {
		this.isDragging = false;

		// Remove dragging style
		this.containerEl.style.opacity = '1';
		this.containerEl.style.zIndex = '1000';
	}

	open() {
		try {
			// Remove existing control panel if any
			this.close();

			// Create control buttons container
			const buttonContainer = document.createElement('div');
			buttonContainer.addClass('button-container');

			// Start button (play icon)
			this.startButton = document.createElement('button');
			this.startButton.addClass('control-button');
			this.startButton.addClass('start-button');
			this.startButton.innerHTML = '';
			this.startButton.setAttribute('title', '🎙️ 开始语音转录');
			this.startButton.addEventListener('click', async () => {
				await this.plugin.startTranscription();
			});
			buttonContainer.appendChild(this.startButton);

			// Pause button (pause/resume icon)
			this.pauseButton = document.createElement('button');
			this.pauseButton.addClass('control-button');
			this.pauseButton.addClass('pause-button');
			this.pauseButton.innerHTML = '';
			this.pauseButton.setAttribute('title', '⏸️ 暂停语音转录');
			this.pauseButton.addEventListener('click', () => {
				if (this.plugin.isTranscriptionPaused()) {
					this.plugin.resumeTranscription();
					this.pauseButton.classList.remove('resume-state');
					this.pauseButton.setAttribute('title', '⏸️ 暂停语音转录');
				} else {
					this.plugin.pauseTranscription();
					this.pauseButton.classList.add('resume-state');
					this.pauseButton.setAttribute('title', '▶️ 恢复语音转录');
				}
			});
			buttonContainer.appendChild(this.pauseButton);

			// Stop button (stop icon)
			this.stopButton = document.createElement('button');
			this.stopButton.addClass('control-button');
			this.stopButton.addClass('stop-button');
			this.stopButton.innerHTML = '';
			this.stopButton.setAttribute('title', '⏹️ 停止语音转录');
			this.stopButton.addEventListener('click', () => {
				this.plugin.stopTranscription();
			});
			buttonContainer.appendChild(this.stopButton);

			// AI Assistant button (bot icon)
			const aiButton = document.createElement('button');
			aiButton.addClass('control-button');
			aiButton.addClass('ai-button');
			aiButton.innerHTML = '';
			aiButton.setAttribute('title', '🤖 AI 会议助手');
			aiButton.addEventListener('click', async () => {
				await this.plugin.toggleAiSidebar();
			});
			buttonContainer.appendChild(aiButton);

			this.containerEl.appendChild(buttonContainer);

			// Insert into DOM using demo.ts approach - fixed position at top center
			this.insertControlPanel();

			// Update button states based on current status
			this.updateButtonStates();

			// Listen for status changes using interval
			this.updateInterval = window.setInterval(() => {
				this.updateButtonStates();
			}, 1000);
		} catch (error) {
			console.error('Error opening control panel:', error);
			new Notice(this.t('controlpanel.failed'));
		}
	}

	private insertControlPanel() {
		// Use demo.ts approach for DOM insertion
		// Fixed position at top center of the workspace
		const workspaceEl = document.querySelector('.mod-vertical.mod-root') as HTMLElement;
		if (workspaceEl) {
			workspaceEl.insertAdjacentElement('afterbegin', this.containerEl);
		} else {
			// Fallback to body insertion
			document.body.appendChild(this.containerEl);
		}
	}

	private updateButtonStates() {
		const isActive = this.plugin.isTranscriptionActive();
		const isPaused = this.plugin.isTranscriptionPaused();

		// Start button - enabled when not active and not paused
		this.startButton.disabled = isActive || isPaused;
		this.startButton.style.opacity = (isActive || isPaused) ? '0.5' : '1';

		// Pause button - enabled when active or paused
		this.pauseButton.disabled = !isActive && !isPaused;
		this.pauseButton.style.opacity = (!isActive && !isPaused) ? '0.5' : '1';

		// Update pause button appearance based on state
		if (isPaused) {
			this.pauseButton.classList.add('resume-state');
			this.pauseButton.setAttribute('title', '▶️ 恢复语音转录');
		} else if (isActive) {
			this.pauseButton.classList.remove('resume-state');
			this.pauseButton.setAttribute('title', '⏸️ 暂停语音转录');
		}

		// Stop button - enabled when active or paused
		this.stopButton.disabled = !isActive && !isPaused;
		this.stopButton.style.opacity = (!isActive && !isPaused) ? '0.5' : '1';
	}

	close() {
		// Remove from document using demo.ts approach
		if (this.containerEl.parentElement) {
			this.containerEl.remove();
		}

		// Clear update interval
		if (this.updateInterval) {
			window.clearInterval(this.updateInterval);
			this.updateInterval = null;
		}
	}

	// Static method to check if control panel exists (similar to demo.ts isExistoolbar)
	static isControlPanelExists(): HTMLElement | null {
		return document.getElementById('speech-transcription-control-panel') as HTMLElement;
	}

	// Static method to remove all control panels (similar to demo.ts selfDestruct)
	static removeAllControlPanels() {
		const panels = document.querySelectorAll('#speech-transcription-control-panel');
		panels.forEach(panel => {
			if (panel.parentElement) {
				panel.remove();
			}
		});
	}
}
