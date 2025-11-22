import { AiClient, ChatMessage } from './ai-client';
import { App } from 'obsidian';
import { t } from '../src/i18n/i18n';
import { AiMeetingSidebarPlugin } from './types';

export interface SlashCommandConfig {
	name: string;
	prompt: string;
	enabled: boolean;
	alias?: string;
	parameters?: { [key: string]: any };
}

export class CommandManager {
	private aiClient: AiClient;
	private app: App;
	private plugin: AiMeetingSidebarPlugin;
	private commands: Map<string, SlashCommandConfig>;
	private commandAliases: Map<string, string>;

	constructor(aiClient: AiClient, app: App, plugin: AiMeetingSidebarPlugin) {
		this.aiClient = aiClient;
		this.app = app;
		this.plugin = plugin;
		this.commands = new Map();
		this.commandAliases = new Map();
		this.initializeCommandAliases();
	}

	private initializeCommandAliases(): void {
		this.commandAliases.set('su', 'summary');
		this.commandAliases.set('tr', 'translate');
		this.commandAliases.set('rw', 'rewrite');
		this.commandAliases.set('ai', 'action-items');
		this.commandAliases.set('cl', 'clear');
		this.commandAliases.set('h', 'help');
	}

	loadCommands(commands: { [key: string]: SlashCommandConfig }) {
		this.commands.clear();

		this.loadBuiltinCommands();
		for (const [key, config] of Object.entries(commands)) {
			if (config.enabled) {
				this.commands.set(key, config);
				if (config.alias) {
					this.commandAliases.set(config.alias, key);
				}
			}
		}
	}

	private loadBuiltinCommands() {
		this.commands.set('clear', {
			name: '清除',
			prompt: '',
			enabled: true
		});

		this.commands.set('help', {
			name: '帮助',
			prompt: '',
			enabled: true
		});
	}

	getAvailableCommands(): string[] {
		return Array.from(this.commands.keys());
	}

	getCommand(commandName: string): SlashCommandConfig | undefined {
		return this.commands.get(commandName);
	}

	async executeCommand(command: string, context: string): Promise<string> {
		// 解析命令和参数
		const { commandName, args, hasContent } = this.parseCommand(command);

		const commandConfig = this.commands.get(commandName);
		if (!commandConfig) {
			throw new Error(t(this.plugin.app)('ai.sidebar.unknownCommand', { command: commandName }));
		}

	// 处理通用命令
		let prompt = commandConfig.prompt;
		let effectiveContext = context;

		// 如果用户没有提供内容，使用当前视图内容作为{context}
		if (!hasContent) {
			// 原始prompt中的{context}会被实际上下文替换
			effectiveContext = context; // 这里context已经是当前视图的内容
		} else {
			// 用户提供了内容，检查是否有明确的内容参数
			if (args['content']) {
				// 用户明确提供了内容，使用用户的内容
				effectiveContext = args['content'];
			} else {
				// 用户提供了参数但没有明确的内容，仍然使用当前视图内容
				effectiveContext = context;
			}
		}

		// 处理内置命令
		if (commandName === 'clear') {
			return this.handleClearCommand();
		}

		if (commandName === 'help') {
			return this.handleHelpCommand();
		}

		// 处理特殊命令
		if (commandName === 'translate') {
			return this.handleTranslateCommand(args, effectiveContext);
		}

		// 替换参数，但{context}会在后续处理中被正确的内容替换
		for (const [key, value] of Object.entries(args)) {
			if (key !== 'content') { // 跳过content参数，因为它已经被处理
				prompt = prompt.replace(`{${key}}`, value);
			}
		}

		return await this.aiClient.executeCommand(prompt, effectiveContext);
	}

	async executeCommandStream(command: string, context: string, conversationHistory: ChatMessage[] = [], onChunk?: (chunk: string) => void, signal?: AbortSignal): Promise<string> {
		// 解析命令和参数
		const { commandName, args, hasContent } = this.parseCommand(command);

		// 处理内置命令
		if (commandName === 'clear') {
			return this.handleClearCommand();
		}

		if (commandName === 'help') {
			const helpText = this.handleHelpCommand();
			// 对于帮助命令，直接返回文本，不需要流式处理
			if (onChunk) {
				// 模拟流式输出
				const words = helpText.split(' ');
				let currentText = '';
				for (const word of words) {
					// 检查是否被取消
					if (signal && signal.aborted) {
						throw new DOMException('用户取消操作', 'AbortError');
					}
					currentText += word + ' ';
					onChunk(word + ' ');
					await new Promise(resolve => setTimeout(resolve, 50)); // 短暂延迟模拟流式
				}
			}
			return helpText;
		}

		// 处理特殊命令
		if (commandName === 'translate') {
			return this.handleTranslateCommand(args, context, conversationHistory, onChunk, signal);
		}

		const commandConfig = this.commands.get(commandName);
		if (!commandConfig) {
			throw new Error(t(this.plugin.app)('ai.sidebar.unknownCommand', { command: commandName }));
		}

		// 获取提示词
		let prompt = commandConfig.prompt;

		// 处理参数
		if (commandConfig.parameters) {
			for (const [key, value] of Object.entries(commandConfig.parameters)) {
				prompt = prompt.replace(`{${key}}`, String(value));
			}
		}

		// 替换参数，但{context}会在后续处理中被正确的内容替换
		for (const [key, value] of Object.entries(args)) {
			if (key !== 'content') { // 跳过content参数，因为它已经被处理
				prompt = prompt.replace(`{${key}}`, value);
			}
		}

		// 替换上下文占位符
		const effectiveContext = context || t(this.plugin.app)('ai.sidebar.noSpecificContext');
		prompt = prompt.replace('{context}', effectiveContext);

		return await this.aiClient.executeCommandStream(prompt, '', conversationHistory, onChunk, signal);
	}

	private parseCommand(command: string): { commandName: string; args: { [key: string]: string }; hasContent: boolean } {
		const parts = command.trim().split(' ');
		let commandName = parts[0].substring(1); // 移除斜杠

		// 检查是否是命令缩写，如果是则转换为完整命令名
		commandName = this.commandAliases.get(commandName) || commandName;
		const args: { [key: string]: string } = {};

		// 检查是否有用户提供的内容（排除空格和仅空格的情况）
		let hasContent = false;
		const contentParts = parts.slice(1);

		// 过滤掉空字符串
		const nonEmptyParts = contentParts.filter(part => part.trim() !== '');

		if (nonEmptyParts.length > 0) {
			hasContent = true;

			// 解析参数
			for (let i = 0; i < nonEmptyParts.length; i++) {
				const part = nonEmptyParts[i];
				if (part.includes('=')) {
					const [key, value] = part.split('=');
					args[key] = value;
				} else if (i === 0) {
					// 第一个参数作为默认参数或内容
					// 如果只有一个部分且不包含等号，视为完整内容
					if (nonEmptyParts.length === 1) {
						args['content'] = part;
					} else {
						args['target'] = part;
					}
				} else {
					// 其他非参数部分作为内容的一部分
					if (args['content']) {
						args['content'] += ' ' + part;
					} else {
						args['content'] = part;
					}
				}
			}
		}

		return { commandName, args, hasContent };
	}

	private handleClearCommand(): string {
		// 这个命令需要在 AI 侧边栏视图中处理
		// 这里返回一个标识，让视图知道这是一个内置命令
		return 'CLEAR_CHAT';
	}

	private handleHelpCommand(): string {
		const help = this.getCommandHelp();
		const translate = t(this.app);
		let helpText = `# ${t(this.plugin.app)('ai.sidebar.helpTitle')}\n\n`;

		for (const [command, description] of Object.entries(help)) {
			helpText += `**/${command}** - ${description}\n`;
		}

		helpText += `\n${translate('command.help.tip')}`;
		return helpText;
	}

	private async handleTranslateCommand(args: { [key: string]: string }, context: string, conversationHistory: ChatMessage[] = [], onChunk?: (chunk: string) => void, signal?: AbortSignal): Promise<string> {
		const targetLanguage = args['target'] || '中文';
		let prompt: string;

		// 如果用户提供了明确的内容参数，使用用户内容
		if (args['content']) {
			prompt = t(this.plugin.app)('ai.sidebar.translatePrompt', { targetLanguage }) + `\n\n${args['content']}`;
		} else {
			// 否则使用当前视图内容
			prompt = t(this.plugin.app)('ai.sidebar.translatePrompt', { targetLanguage }) + `\n\n${context}`;
		}

		return await this.aiClient.executeCommandStream(prompt, '', conversationHistory, onChunk, signal);
	}

	updateCommand(commandName: string, config: SlashCommandConfig) {
		if (config.enabled) {
			this.commands.set(commandName, config);
		} else {
			this.commands.delete(commandName);
		}
	}

	addCustomCommand(commandName: string, config: SlashCommandConfig) {
		this.commands.set(commandName, config);
	}

	removeCommand(commandName: string) {
		this.commands.delete(commandName);
	}

	// 获取命令描述信息
	getCommandHelp(): { [key: string]: string } {
		const help: { [key: string]: string } = {};
		const translate = t(this.app);

		// 内置命令帮助
		help['summary'] = translate('command.help.summary');
		help['translate'] = translate('command.help.translate');
		help['rewrite'] = translate('command.help.rewrite');
		help['action-items'] = translate('command.help.actionItems');
		help['new'] = translate('command.help.new');
		help['clear'] = translate('command.help.clear');
		help['help'] = translate('command.help.help');

		// 自定义命令帮助
		for (const [commandName, config] of this.commands.entries()) {
			if (!help[commandName]) {
				let helpText = config.name;
				if (config.alias) {
					helpText += ` (alias: /${config.alias})`;
				}
				help[commandName] = helpText;
			}
		}

		return help;
	}
}