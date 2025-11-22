// 定义所有翻译键的类型
export interface TranslationKeys {
	// 通用
	'common.start': string;
	'common.stop': string;
	'common.pause': string;
	'common.resume': string;
	'common.settings': string;
	'common.test': string;
	'common.success': string;
	'common.error': string;
	'common.warning': string;
	'common.info': string;
	'common.loading': string;
	'common.enabled': string;
	'common.disabled': string;
	'common.save': string;
	'common.cancel': string;
	'common.edit': string;
	'common.add': string;
	'common.delete': string;
	'common.confirm': string;

	// 插件名称和描述
	'plugin.name': string;
	'plugin.description': string;
	'plugin.author': string;

	// 状态栏
	'statusbar.active': string;
	'statusbar.wait': string;
	'statusbar.connReady': string;
	'statusbar.audioReady': string;
	'statusbar.paused': string;
	'statusbar.detecting': string;
	'statusbar.processing': string;
	'statusbar.transcribing': string;
	'statusbar.connecting': string;
	'statusbar.ready': string;

	// 命令
	'command.startTranscription': string;
	'command.stopTranscription': string;
	'command.pauseTranscription': string;
	'command.toggleAiSidebar': string;
	'command.newAiChat': string;

	// 控制面板
	'controlpanel.title': string;
	'controlpanel.start': string;
	'controlpanel.pause': string;
	'controlpanel.resume': string;
	'controlpanel.stop': string;
	'controlpanel.ai': string;
	'controlpanel.opened': string;
	'controlpanel.closed': string;
	'controlpanel.failed': string;

	// 通知消息
	'notice.transcription.started': string;
	'notice.transcription.stopped': string;
	'notice.transcription.paused': string;
	'notice.transcription.resumed': string;
	'notice.transcription.failed': string;
	'notice.transcription.notActive': string;
	'notice.transcription.insertFailed': string;
	'notice.websocket.error': string;
	'notice.websocket.lost': string;
	'notice.websocket.reconnecting': string;
	'notice.websocket.reconnected': string;
	'notice.websocket.reconnectFailed': string;
	'notice.ai.opened': string;
	'notice.ai.alreadyOpen': string;
	'notice.ai.failed': string;
	'notice.ai.chatStarted': string;
	'notice.connection.testSuccess': string;
	'notice.connection.testFailed': string;

	// 设置 - 语音转录
	'settings.speech.title': string;
	'settings.speech.apiEndpoint': string;
	'settings.speech.apiEndpoint.desc': string;
	'settings.speech.apiKey': string;
	'settings.speech.apiKey.desc': string;
	'settings.speech.model': string;
	'settings.speech.model.desc': string;
	'settings.speech.language': string;
	'settings.speech.language.desc': string;
	'settings.speech.audioFormat': string;
	'settings.speech.audioFormat.desc': string;
	'settings.speech.sampleRate': string;
	'settings.speech.sampleRate.desc': string;
	'settings.speech.channels': string;
	'settings.speech.channels.desc': string;
	'settings.speech.vadSensitivity': string;
	'settings.speech.vadSensitivity.desc': string;
	'settings.speech.maxDuration': string;
	'settings.speech.maxDuration.desc': string;
	'settings.speech.instructions': string;
	'settings.speech.formatInstructions': string;
	'settings.speech.vadInstructions': string;
	'settings.speech.keyboardShortcuts': string;

	// 设置 - AI 助手
	'settings.ai.title': string;
	'settings.ai.enableSidebar': string;
	'settings.ai.enableSidebar.desc': string;
	'settings.ai.apiEndpoint': string;
	'settings.ai.apiEndpoint.desc': string;
	'settings.ai.apiKey': string;
	'settings.ai.apiKey.desc': string;
	'settings.ai.model': string;
	'settings.ai.model.desc': string;
	'settings.ai.maxHistory': string;
	'settings.ai.maxHistory.desc': string;
	'settings.ai.maxConversationHistory': string;
	'settings.ai.maxConversationHistory.desc': string;
	'settings.ai.testConnection': string;
	'settings.ai.testConnection.desc': string;

	// 设置 - 斜杠命令
	'settings.commands.title': string;
	'settings.commands.aliasInfo': string;
	'settings.commands.addCustom': string;
	'settings.commands.addCustom.desc': string;
	'settings.commands.tip': string;
	'settings.commands.builtIn': string;
	'settings.commands.custom': string;
	'settings.commands.promptDesc': string;
	'settings.commands.alias': string;

	// 命令默认提示词
	'commands.defaultPrompts.summary': string;
	'commands.defaultPrompts.translate': string;
	'commands.defaultPrompts.rewrite': string;
	'commands.defaultPrompts.actionItems': string;
	'commands.defaultPrompts.generic': string;

	// 按钮提示文本
	'buttons.startTranscription': string;
	'buttons.pauseTranscription': string;
	'buttons.resumeTranscription': string;
	'buttons.stopTranscription': string;
	'buttons.aiAssistant': string;

	// 占位符文本
	'placeholder.apiKey': string;
	'placeholder.aiApiKey': string;

	// 斜杠命令
	'command.summary.name': string;
	'command.translate.name': string;
	'command.rewrite.name': string;
	'command.actionItems.name': string;
	'command.clear.name': string;
	'command.help.name': string;

	// 命令编辑
	'command.edit.title': string;
	'command.edit.addTitle': string;
	'command.edit.name': string;
	'command.edit.prompt': string;
	'command.edit.alias': string;
	'command.edit.alias.placeholder': string;
	'command.edit.enabled': string;
	'command.edit.tip': string;
	'command.edit.emptyName': string;
	'command.edit.emptyPrompt': string;
	'command.edit.invalidAlias': string;
	'command.edit.exists': string;
	'command.edit.added': string;

	// 语言设置
	'settings.language.current': string;
	'settings.language.auto': string;

	// 命令删除
	'command.delete.builtInError': string;
	'command.delete.confirm': string;
	'command.delete.success': string;

	// 命令帮助文本
	'command.help.summary': string;
	'command.help.translate': string;
	'command.help.rewrite': string;
	'command.help.actionItems': string;
	'command.help.new': string;
	'command.help.clear': string;
	'command.help.help': string;
	'command.help.tip': string;

	// AI 侧边栏
	'ai.sidebar.title': string;
	'ai.sidebar.welcome': string;
	'ai.sidebar.newChat': string;
	'ai.sidebar.cleared': string;
	'ai.sidebar.inputPlaceholder': string;
	'ai.sidebar.loadingText': string;
	'ai.sidebar.contextTooltip': string;
	'ai.sidebar.newChatStarted': string;
	'ai.sidebar.chatCleared': string;
	'ai.sidebar.insertedToNote': string;
	'ai.sidebar.noActiveNote': string;
	'ai.sidebar.historyInDevelopment': string;
	'ai.sidebar.unknownCommand': string;
	'ai.sidebar.translatePrompt': string;
	'ai.sidebar.noSpecificContext': string;
	'ai.sidebar.helpTitle': string;
	'ai.sidebar.insertButton': string;
	'ai.sidebar.deleteButton': string;
	'ai.sidebar.sendButton': string;
	'ai.sidebar.stopButton': string;
}

// 支持的语言类型
export type SupportedLocale = 'zh-CN' | 'en-US';

// 语言包类型
export type LocaleBundle = Record<keyof TranslationKeys, string>;

// 翻译函数类型
export type TranslateFunction = <K extends keyof TranslationKeys>(
	key: K,
	params?: Record<string, string | number>
) => string;