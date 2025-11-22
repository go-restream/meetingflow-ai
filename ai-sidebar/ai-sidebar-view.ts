import { ItemView, WorkspaceLeaf, MarkdownView, Notice } from 'obsidian';
import AiMeetingSidebarPlugin from '../main';
import { t, getCurrentLocale } from '../src/i18n/i18n';

export const AI_SIDEBAR_VIEW_TYPE = 'ai-meeting-sidebar-view';

export class AiSidebarView extends ItemView {
	static VIEW_TYPE = AI_SIDEBAR_VIEW_TYPE;
	plugin: AiMeetingSidebarPlugin;
	private inputEl: HTMLTextAreaElement;
	private outputEl: HTMLElement;
	private submitButton: HTMLButtonElement;
	private clearButton: HTMLButtonElement;
	private historyButton: HTMLButtonElement;
	private newChatButton: HTMLButtonElement;
	private loadingIndicator: HTMLElement;
	private commandSuggestionsEl: HTMLElement;
	private selectedSuggestionIndex: number = -1;
	private currentSuggestions: string[] = [];
	private contextToggle: HTMLElement;
	private includeContext: boolean = true;
	private currentStreamingMessage: HTMLElement | null = null;
	private currentStreamingContent: HTMLElement | null = null;
	private isStreaming: boolean = false;
	private abortController: AbortController | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: AiMeetingSidebarPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType() {
		return AI_SIDEBAR_VIEW_TYPE;
	}

	getDisplayText() {
		return t(this.plugin.app)('ai.sidebar.title');
	}

	getIcon() {
		return 'bot';
	}

	async onOpen() {
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();
		container.addClass('ai-sidebar-container');

		this.createHeader(container);
		this.createOutputArea(container);
		this.createFloatingInputArea(container);
	}

	async onClose() {
	}

	private createHeader(container: HTMLElement) {
		const header = container.createDiv('ai-sidebar-header');

		const title = header.createEl('h3', { text: t(this.plugin.app)('ai.sidebar.title') });
		title.addClass('ai-sidebar-title');

		const controls = header.createDiv('ai-sidebar-controls');

		this.newChatButton = controls.createEl('button', {
			cls: 'ai-sidebar-button new-chat-button'
		});
		this.newChatButton.innerHTML = `
			<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<path d="M5 12h14"/>
				<path d="M12 5v14"/>
			</svg>
		`;
		this.newChatButton.addEventListener('click', () => {
			this.startNewChat();
		});

		this.historyButton = controls.createEl('button', {
			cls: 'ai-sidebar-button history-button'
		});
		this.historyButton.innerHTML = `
			<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<circle cx="12" cy="12" r="10"/>
				<path d="M12 6v6l4 2"/>
			</svg>
		`;
		this.historyButton.addEventListener('click', () => {
			this.showHistory();
		});

		this.clearButton = controls.createEl('button', {
			cls: 'ai-sidebar-button clear-button'
		});
		this.clearButton.innerHTML = `
			<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<path d="M3 6h18"/>
				<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>
				<path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
			</svg>
		`;
		this.clearButton.addEventListener('click', () => {
			this.clearChat();
		});
	}

	private createFloatingInputArea(container: HTMLElement) {
		const floatingInputArea = container.createDiv('ai-sidebar-floating-input-area');

		this.commandSuggestionsEl = floatingInputArea.createDiv('ai-sidebar-command-suggestions');
		this.commandSuggestionsEl.style.display = 'none';

		this.loadingIndicator = container.createDiv('ai-sidebar-loading');
		this.loadingIndicator.style.display = 'none';
		this.loadingIndicator.style.visibility = 'hidden';
		this.loadingIndicator.style.opacity = '0';
		this.loadingIndicator.innerHTML = `
			<div class="ai-loading-container">
				<div class="ai-loading-dots">
					<div class="ai-loading-dot"></div>
					<div class="ai-loading-dot"></div>
					<div class="ai-loading-dot"></div>
				</div>
				<div class="ai-loading-text">${t(this.plugin.app)('ai.sidebar.loadingText')}</div>
			</div>
		`;

		const inputContainer = floatingInputArea.createDiv('ai-sidebar-input-container');

		const inputWrapper = inputContainer.createDiv('ai-sidebar-input-wrapper');

		this.contextToggle = inputWrapper.createDiv('ai-sidebar-context-toggle');
		this.contextToggle.innerHTML = `
			<div class="ai-sidebar-toggle-switch">
				<div class="ai-sidebar-toggle-slider"></div>
			</div>
			<div class="ai-sidebar-tooltip">${t(this.plugin.app)('ai.sidebar.contextTooltip')}</div>
		`;

		this.contextToggle.addEventListener('click', () => {
			this.toggleContext();
		});

		this.updateContextToggleUI();

		this.inputEl = inputWrapper.createEl('textarea');
		this.inputEl.addClass('ai-sidebar-input');
		this.inputEl.placeholder = t(this.plugin.app)('ai.sidebar.inputPlaceholder');
		this.submitButton = inputWrapper.createEl('button', {
			cls: 'ai-sidebar-send-button'
		});
		this.submitButton.innerHTML = `
			<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<path d="m22 2-7 20-4-9-9-4Z"/>
				<path d="M22 2 11 13"/>
			</svg>
		`;
		this.submitButton.addEventListener('click', () => {
			this.handleSubmit();
		});

		this.inputEl.addEventListener('keydown', (event) => {
			if (event.key === 'Enter' && !event.shiftKey) {
				event.preventDefault();
				this.handleSubmit();
			} else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
				this.handleSuggestionNavigation(event.key);
				event.preventDefault();
			} else if (event.key === 'Escape') {
				this.hideCommandSuggestions();
			}
		});

		this.inputEl.addEventListener('input', () => {
			this.handleInputChange();
		});
		this.inputEl.addEventListener('focus', () => {
			this.handleInputFocus();
		});

		this.inputEl.addEventListener('blur', () => {
			this.handleInputBlur();
		});

		// 监听点击外部事件
		document.addEventListener('click', (event) => {
			if (!this.inputEl.contains(event.target as Node) &&
				!this.commandSuggestionsEl.contains(event.target as Node)) {
				this.hideCommandSuggestions();
			}
		});
	}

	private createOutputArea(container: HTMLElement) {
		// 输出区域（最大化高度）
		const outputArea = container.createDiv('ai-sidebar-output-area');

		// 输出内容区域
		this.outputEl = outputArea.createDiv('ai-sidebar-output');
		this.outputEl.innerHTML = `<div class="ai-sidebar-welcome">${t(this.plugin.app)('ai.sidebar.welcome')}</div>`;
	}

	private async handleSubmit() {
		const input = this.inputEl.value.trim();

		// 隐藏命令建议
		this.hideCommandSuggestions();

		if (this.isStreaming && this.abortController) {
			this.abortController.abort();
			await new Promise(resolve => setTimeout(resolve, 100));
			return;
		}

		if (!input) return;

		this.inputEl.value = '';

		if (input.startsWith('/')) {
			await this.handleSlashCommand(input);
		} else {
			await this.handleRegularMessage(input);
		}
	}

	private async handleSlashCommand(command: string) {
		try {
			// 设置流式状态
			this.isStreaming = true;
			this.abortController = new AbortController();
			this.updateSubmitButtonState();

			// 确保有活跃的会话
			this.plugin.sessionManager.ensureActiveSession();

			// 获取限制数量的历史对话
			const conversationHistory = this.plugin.sessionManager.getConversationHistory(this.plugin.settings.maxConversationHistory);

			// 根据开关状态决定是否获取上下文
			let context = '';
			if (this.includeContext) {
				// 只在获取上下文时显示loading
				this.showLoading(true);
				context = await this.getContextText();
				this.showLoading(false);
			}

			// 初始化流式消息显示
			this.initializeStreamingMessage(command);

			// 使用流式处理执行命令，传递历史对话
			const result = await this.plugin.commandManager.executeCommandStream(
				command,
				context,
				conversationHistory,
				(chunk) => this.updateStreamingContent(chunk),
				this.abortController.signal
			);

			// 检查是否是内置命令
			if (result === 'CLEAR_CHAT') {
				this.clearChat();
				return;
			}

			// 完成流式显示
			this.finalizeStreamingResult(result, command);

			// 更新对话历史，应用限制
			this.plugin.sessionManager.addMessage({
				role: 'user',
				content: command
			}, this.plugin.settings.maxConversationHistory);
			this.plugin.sessionManager.addMessage({
				role: 'assistant',
				content: result
			}, this.plugin.settings.maxConversationHistory);

			// 保存到历史记录
			await this.plugin.historyManager.addToHistory({
				type: 'command',
				input: command,
				output: result,
				context: context
			});

		} catch (error) {
			if (error.name === 'AbortError') {
				// 用户取消操作 - 保留已生成的内容，只停止流式状态
				if (this.currentStreamingMessage) {
					// 移除流式样式类
					this.currentStreamingMessage.classList.remove('ai-sidebar-streaming');

					// 移除光标动画（如果存在）
					const cursorElement = this.currentStreamingMessage.querySelector('.ai-streaming-cursor');
					if (cursorElement) {
						cursorElement.remove();
					}

					// 将消息标记为历史消息
					this.currentStreamingMessage.classList.add('ai-sidebar-history-message');

					// 保留引用但重置流式状态
					this.currentStreamingMessage = null;
					this.currentStreamingContent = null;
				}
			} else {
				console.error('执行命令失败:', error);
				this.displayError(`执行失败: ${error.message}`);
				this.showLoading(false);
			}
		} finally {
			// 重置流式状态
			this.isStreaming = false;
			this.abortController = null;
			this.updateSubmitButtonState();
		}
	}

	private async handleRegularMessage(message: string) {
		try {
			// 设置流式状态
			this.isStreaming = true;
			this.abortController = new AbortController();
			this.updateSubmitButtonState();

			// 确保有活跃的会话
			this.plugin.sessionManager.ensureActiveSession();

			// 获取限制数量的历史对话
			const conversationHistory = this.plugin.sessionManager.getConversationHistory(this.plugin.settings.maxConversationHistory);

			// 根据开关状态决定是否获取上下文
			let context = '';
			if (this.includeContext) {
				// 只在获取上下文时显示loading
				this.showLoading(true);
				context = await this.getContextText();
				this.showLoading(false);
			}

			// 初始化流式消息显示
			this.initializeStreamingMessage(message);

			// 使用流式处理，传递限制后的历史对话
			const result = await this.plugin.aiClient.processMessageStream(
				message,
				context,
				conversationHistory,
				(chunk) => this.updateStreamingContent(chunk),
				this.abortController.signal
			);

			// 完成流式显示
			this.finalizeStreamingResult(result, message);

			// 更新对话历史，应用限制
			this.plugin.sessionManager.addMessage({
				role: 'user',
				content: message
			}, this.plugin.settings.maxConversationHistory);
			this.plugin.sessionManager.addMessage({
				role: 'assistant',
				content: result
			}, this.plugin.settings.maxConversationHistory);

			// 保存到历史记录
			await this.plugin.historyManager.addToHistory({
				type: 'chat',
				input: message,
				output: result,
				context: context
			});

		} catch (error) {
			if (error.name === 'AbortError') {
				// 用户取消操作 - 保留已生成的内容，只停止流式状态
				if (this.currentStreamingMessage) {
					// 移除流式样式类
					this.currentStreamingMessage.classList.remove('ai-sidebar-streaming');

					// 移除光标动画（如果存在）
					const cursorElement = this.currentStreamingMessage.querySelector('.ai-streaming-cursor');
					if (cursorElement) {
						cursorElement.remove();
					}

					// 将消息标记为历史消息
					this.currentStreamingMessage.classList.add('ai-sidebar-history-message');

					// 保留引用但重置流式状态
					this.currentStreamingMessage = null;
					this.currentStreamingContent = null;
				}
			} else {
				console.error('处理消息失败:', error);
				this.displayError(`处理失败: ${error.message}`);
				this.showLoading(false);
			}
		} finally {
			// 重置流式状态
			this.isStreaming = false;
			this.abortController = null;
			this.updateSubmitButtonState();
		}
	}

	private async getContextText(): Promise<string> {
		// 方法1：尝试获取活动的Markdown视图
		let activeView = this.app.workspace.getActiveViewOfType(MarkdownView);

		// 方法2：如果方法1失败，尝试获取最近的活动视图
		if (!activeView) {
			const mostRecentLeaf = this.app.workspace.getMostRecentLeaf();
			if (mostRecentLeaf?.view instanceof MarkdownView) {
				activeView = mostRecentLeaf.view;
			}
		}

		// 方法3：如果前两种方法都失败，尝试遍历所有打开的叶子
		if (!activeView) {
			const leaves = this.app.workspace.getLeavesOfType('markdown');
			if (leaves.length > 0) {
				const leaf = leaves[leaves.length - 1]; // 使用最后一个
				if (leaf.view instanceof MarkdownView) {
					activeView = leaf.view;
				}
			}
		}

		if (activeView) {
			const editor = activeView.editor;
			const selection = editor.getSelection();

			if (selection && selection.trim()) {
				// 返回选中的文本
				return selection;
			} else {
				// 返回当前笔记全文
				return editor.getValue();
			}
		}

		return '';
	}

	private displayResult(result: string, input: string) {
		// 清空欢迎信息
		if (this.outputEl.querySelector('.ai-sidebar-welcome')) {
			this.outputEl.empty();
		}

		// 检查是否已有消息，如果有则将现有消息标记为历史消息
		const existingMessages = this.outputEl.querySelectorAll('.ai-sidebar-message:not(.ai-sidebar-history-message)');
		existingMessages.forEach(msg => {
			msg.classList.add('ai-sidebar-history-message');
		});

		// 创建消息容器（最新消息）
		const messageContainer = this.outputEl.createDiv('ai-sidebar-message');

		// AI 响应
		const aiMessage = messageContainer.createDiv('ai-sidebar-ai-message');
		aiMessage.innerHTML = `
			<div class="ai-message-icon ai-icon-bot">
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<path d="M12 8V4H8"></path>
					<rect width="16" height="12" x="4" y="8" rx="2"></rect>
					<path d="M2 14h2"></path>
					<path d="M20 14h2"></path>
					<path d="M15 13v2"></path>
					<path d="M9 13v2"></path>
				</svg>
			</div>
			<div class="ai-message-content">${this.formatResponse(result)}</div>
		`;

		// 用户输入（作为引用）
		const userMessage = messageContainer.createDiv('ai-sidebar-user-message');
		userMessage.innerHTML = `
			<div class="ai-message-icon ai-icon-user">
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path>
					<circle cx="12" cy="7" r="4"></circle>
				</svg>
			</div>
			<div class="ai-message-content">${this.escapeHtml(input)}</div>
		`;

		// 创建底部容器，包含时间戳和操作按钮
		const messageFooter = messageContainer.createDiv('ai-sidebar-message-footer');

		// 添加时间戳到底部中间
		this.addTimestamp(messageFooter);

		// 创建按钮容器
		const buttonContainer = messageFooter.createDiv('ai-sidebar-button-container');

		// 添加插入按钮
		this.addInsertButton(buttonContainer, result);

		// 添加删除按钮
		this.addDeleteButton(buttonContainer, messageContainer);

		// 将新消息插入到顶部（第一个位置）
		this.outputEl.insertBefore(messageContainer, this.outputEl.firstChild);

		// 滚动到顶部显示新消息
		this.outputEl.scrollTop = 0;
	}

	private initializeStreamingMessage(input: string): void {
		// 清空欢迎信息
		if (this.outputEl.querySelector('.ai-sidebar-welcome')) {
			this.outputEl.empty();
		}

		// 检查是否已有消息，如果有则将现有消息标记为历史消息
		const existingMessages = this.outputEl.querySelectorAll('.ai-sidebar-message:not(.ai-sidebar-history-message)');
		existingMessages.forEach(msg => {
			msg.classList.add('ai-sidebar-history-message');
		});

		// 创建消息容器（最新消息）
		this.currentStreamingMessage = this.outputEl.createDiv('ai-sidebar-message ai-sidebar-streaming');

		// AI 响应容器
		const aiMessage = this.currentStreamingMessage.createDiv('ai-sidebar-ai-message');
		aiMessage.innerHTML = `
			<div class="ai-message-icon ai-icon-bot">
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<path d="M12 8V4H8"></path>
					<rect width="16" height="12" x="4" y="8" rx="2"></rect>
					<path d="M2 14h2"></path>
					<path d="M20 14h2"></path>
					<path d="M15 13v2"></path>
					<path d="M9 13v2"></path>
				</svg>
			</div>
			<div class="ai-message-content ai-streaming-content"></div>
		`;

		this.currentStreamingContent = aiMessage.querySelector('.ai-streaming-content') as HTMLElement;

		// 用户输入（作为引用）
		const userMessage = this.currentStreamingMessage.createDiv('ai-sidebar-user-message');
		userMessage.innerHTML = `
			<div class="ai-message-icon ai-icon-user">
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path>
					<circle cx="12" cy="7" r="4"></circle>
				</svg>
			</div>
			<div class="ai-message-content">${this.escapeHtml(input)}</div>
		`;

		// 将新消息插入到顶部（第一个位置）
		this.outputEl.insertBefore(this.currentStreamingMessage, this.outputEl.firstChild);

		// 滚动到顶部显示新消息
		this.outputEl.scrollTop = 0;
	}

	private updateStreamingContent(chunk: string): void {
		if (!this.currentStreamingContent) return;

		// 添加新的内容块
		this.currentStreamingContent.innerHTML += this.formatResponse(chunk);

		// 添加闪烁光标效果
		const cursor = document.createElement('span');
		cursor.className = 'ai-streaming-cursor';
		cursor.textContent = '|';
		this.currentStreamingContent.appendChild(cursor);

		// 移除之前的光标（如果存在）
		const prevCursor = this.currentStreamingContent.querySelector('.ai-streaming-cursor:not(:last-child)');
		if (prevCursor) {
			prevCursor.remove();
		}

		// 滚动到底部显示最新内容
		this.outputEl.scrollTop = 0;
	}

	private finalizeStreamingResult(result: string, input: string): void {
		if (!this.currentStreamingMessage || !this.currentStreamingContent) {
			// 如果流式初始化失败，回退到普通显示
			this.displayResult(result, input);
			return;
		}

		// 移除光标
		const cursor = this.currentStreamingContent.querySelector('.ai-streaming-cursor');
		if (cursor) {
			cursor.remove();
		}

		// 更新最终内容
		this.currentStreamingContent.innerHTML = this.formatResponse(result);

		// 移除流式标记
		this.currentStreamingMessage.classList.remove('ai-sidebar-streaming');

		// 创建底部容器，包含时间戳和操作按钮
		const messageFooter = this.currentStreamingMessage.createDiv('ai-sidebar-message-footer');

		// 添加时间戳到底部中间
		this.addTimestamp(messageFooter);

		// 创建按钮容器
		const buttonContainer = messageFooter.createDiv('ai-sidebar-button-container');

		// 添加插入按钮
		this.addInsertButton(buttonContainer, result);

		// 添加删除按钮
		this.addDeleteButton(buttonContainer, this.currentStreamingMessage);

		// 重置流式状态
		this.currentStreamingMessage = null;
		this.currentStreamingContent = null;

		// 确保滚动到正确位置
		this.outputEl.scrollTop = 0;
	}

	private displayError(error: string) {
		// 检查是否已有消息，如果有则将现有消息标记为历史消息
		const existingMessages = this.outputEl.querySelectorAll('.ai-sidebar-message:not(.ai-sidebar-history-message), .ai-sidebar-error:not(.ai-sidebar-history-message)');
		existingMessages.forEach(msg => {
			msg.classList.add('ai-sidebar-history-message');
		});

		const errorContainer = this.outputEl.createDiv('ai-sidebar-error');

		// 创建错误消息内容
		const errorContent = errorContainer.createDiv('ai-error-content');
		errorContent.innerHTML = `
			<div class="ai-message-icon ai-icon-error">
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<circle cx="12" cy="12" r="10"></circle>
					<line x1="12" x2="12" y1="8" y2="12"></line>
					<line x1="12" x2="12.01" y1="16" y2="16"></line>
				</svg>
			</div>
			<div class="ai-message-content">${this.escapeHtml(error)}</div>
		`;

		// 创建底部容器，包含时间戳和删除按钮
		const errorFooter = errorContainer.createDiv('ai-sidebar-message-footer');

		// 添加时间戳
		this.addTimestamp(errorFooter);

		// 创建按钮容器
		const buttonContainer = errorFooter.createDiv('ai-sidebar-button-container');

		// 添加删除按钮
		this.addDeleteButton(buttonContainer, errorContainer);

		// 将错误消息插入到顶部
		this.outputEl.insertBefore(errorContainer, this.outputEl.firstChild);

		// 滚动到顶部显示错误
		this.outputEl.scrollTop = 0;
	}

	private addInsertButton(container: HTMLElement, content: string) {
		const insertButton = container.createEl('button', {
			cls: 'ai-sidebar-insert-button'
		});
		insertButton.innerHTML = `
			<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<rect width="13" height="7" x="8" y="3" rx="1"/>
				<path d="m2 9 3 3-3 3"/>
				<rect width="13" height="7" x="8" y="14" rx="1"/>
			</svg>
		`;

		insertButton.addEventListener('click', () => {
			this.insertToEditor(content);
		});
	}

	private addDeleteButton(container: HTMLElement, messageContainer: HTMLElement) {
		const deleteButton = container.createEl('button', {
			cls: 'ai-sidebar-delete-button'
		});
		deleteButton.innerHTML = `
			<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<path d="m20 20H7l-4-4a1 1 0 0 1 0-1.414l9-9a1 1 0 0 1 1.414 0l7 7a1 1 0 0 1 0 1.414l-4 4"/>
				<line x1="11" y1="11" x2="17" y2="17"/>
			</svg>
		`;

		deleteButton.addEventListener('click', () => {
			this.deleteMessage(messageContainer);
		});
	}

	private addTimestamp(container: HTMLElement) {
		const timestamp = container.createDiv('ai-sidebar-timestamp');
		const now = new Date();
		const locale = getCurrentLocale(this.plugin.app) === 'zh-CN' ? 'zh-CN' : 'en-US';
		const dateString = now.toLocaleDateString(locale, {
			year: 'numeric',
			month: '2-digit',
			day: '2-digit'
		});
		const timeString = now.toLocaleTimeString(locale, {
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit'
		});
		timestamp.textContent = `${dateString} ${timeString}`;
	}

	private deleteMessage(messageContainer: HTMLElement) {
		// 添加删除动画
		messageContainer.style.transition = 'all 0.3s ease';
		messageContainer.style.opacity = '0';
		messageContainer.style.transform = 'translateX(20px)';

		// 延迟移除元素
		setTimeout(() => {
			if (messageContainer.parentNode) {
				messageContainer.remove();
			}

			// 检查是否需要更新顶部消息高亮
			this.updateMessageHighlighting();

			// 如果没有消息了，显示欢迎信息
			if (this.outputEl.children.length === 0 ||
				(this.outputEl.children.length === 1 && this.outputEl.children[0].classList.contains('ai-sidebar-welcome'))) {
				this.outputEl.innerHTML = `<div class="ai-sidebar-welcome">${t(this.plugin.app)('ai.sidebar.welcome')}</div>`;
			}
		}, 300);
	}

	private updateMessageHighlighting() {
		const allMessages = this.outputEl.querySelectorAll('.ai-sidebar-message');

		// 如果有消息，将第一个（最新）消息设为活跃状态，其余为历史状态
		if (allMessages.length > 0) {
			const firstMessage = allMessages[0] as HTMLElement;
			const restMessages = Array.from(allMessages).slice(1);

			// 移除第一个消息的历史标记，使其突出显示
			firstMessage.classList.remove('ai-sidebar-history-message');

			// 为其余消息添加历史标记
			restMessages.forEach(msg => {
				msg.classList.add('ai-sidebar-history-message');
			});
		}
	}

	private async insertToEditor(content: string) {
		let activeView: MarkdownView | null = null;
		activeView = this.app.workspace.getActiveViewOfType(MarkdownView);

		if (!activeView) {
			const mostRecentLeaf = this.app.workspace.getMostRecentLeaf();
			if (mostRecentLeaf?.view instanceof MarkdownView) {
				activeView = mostRecentLeaf.view;
			}
		}

		if (!activeView) {
			const allLeaves = this.app.workspace.getLeavesOfType('markdown');
			for (const leaf of allLeaves) {
				if (leaf.view instanceof MarkdownView) {
					activeView = leaf.view;
					break;
				}
			}
		}

		if (!activeView) {
			const leftLeaf = this.app.workspace.getLeftLeaf(false);
			if (leftLeaf?.view instanceof MarkdownView) {
				activeView = leftLeaf.view;
			}
		}

		if (activeView) {
			const editor = activeView.editor;
			const cursor = editor.getCursor();
			const fileName = activeView.file?.basename || '未命名文件';

			editor.replaceRange(`\n\n${content}`, cursor);

			new Notice(t(this.plugin.app)('ai.sidebar.insertedToNote', { fileName }));
			this.app.workspace.revealLeaf(activeView.leaf);
		} else {
			new Notice(t(this.plugin.app)('ai.sidebar.noActiveNote'));
		}
	}

	private showLoading(show: boolean) {
		if (show) {
			// 简单直接的显示方式
			this.loadingIndicator.style.display = 'flex';
			// 强制重排确保 CSS 计算正确
			this.loadingIndicator.offsetHeight;
			this.loadingIndicator.style.visibility = 'visible';
			this.loadingIndicator.style.opacity = '1';
		} else {
			this.loadingIndicator.style.visibility = 'hidden';
			this.loadingIndicator.style.opacity = '0';
			// 延迟隐藏 display
			setTimeout(() => {
				if (this.loadingIndicator && this.loadingIndicator.style.visibility === 'hidden') {
					this.loadingIndicator.style.display = 'none';
				}
			}, 300);
		}
		this.submitButton.disabled = show;
		this.inputEl.disabled = show;
	}

	private toggleContext() {
		this.includeContext = !this.includeContext;
		this.updateContextToggleUI();
	}

	private updateContextToggleUI() {
		if (this.contextToggle) {
			const slider = this.contextToggle.querySelector('.ai-sidebar-toggle-slider') as HTMLElement;
			if (this.includeContext) {
				this.contextToggle.addClass('ai-sidebar-toggle-active');
				slider.style.transform = 'translateX(12px)';
			} else {
				this.contextToggle.removeClass('ai-sidebar-toggle-active');
				slider.style.transform = 'translateX(0)';
			}
		}
	}

	private handleInputChange() {
		const value = this.inputEl.value;
		const cursorPos = this.inputEl.selectionStart;

		// 检查光标是否在斜杠命令的位置
		const beforeCursor = value.substring(0, cursorPos);
		const slashMatch = beforeCursor.match(/\/(\w*)$/);

		if (slashMatch) {
			const partialCommand = slashMatch[1];
			this.showCommandSuggestions(partialCommand);
		} else {
			this.hideCommandSuggestions();
		}

		// 更新焦点样式
		this.updateFocusStyle();
	}

	private showCommandSuggestions(partialCommand: string) {
		const availableCommands = this.plugin.commandManager.getAvailableCommands();
		const commandHelp = this.plugin.commandManager.getCommandHelp();

		// 过滤匹配的命令
		this.currentSuggestions = availableCommands.filter((command: string) =>
			command.startsWith(partialCommand.toLowerCase())
		);

		if (this.currentSuggestions.length === 0) {
			this.hideCommandSuggestions();
			return;
		}

		// 清空建议容器
		this.commandSuggestionsEl.empty();

		// 创建建议列表
		const suggestionList = this.commandSuggestionsEl.createEl('ul', {
			cls: 'command-suggestion-list'
		});

		this.currentSuggestions.forEach((command, index) => {
			const suggestionItem = suggestionList.createEl('li', {
				cls: 'command-suggestion-item'
			});

			if (index === this.selectedSuggestionIndex) {
				suggestionItem.addClass('selected');
			}

			// 显示命令名称和描述
			const commandName = suggestionItem.createEl('span', {
				text: `/${command}`,
				cls: 'command-name'
			});

			const commandDesc = suggestionItem.createEl('span', {
				text: commandHelp[command] || '',
				cls: 'command-description'
			});

			// 点击事件 - 使用mousedown防止输入框失去焦点
			suggestionItem.addEventListener('mousedown', (event) => {
				// 阻止默认行为，防止输入框失去焦点
				event.preventDefault();
				// 获取当前光标位置
				const currentCursorPos = this.inputEl.selectionStart;
				this.selectSuggestion(command, currentCursorPos);
			});

			// 保留点击事件作为备选
			suggestionItem.addEventListener('click', (event) => {
				// 获取当前光标位置，而不是创建时的位置
				const currentCursorPos = this.inputEl.selectionStart;
				this.selectSuggestion(command, currentCursorPos);
				event.preventDefault();
			});
		});

		this.commandSuggestionsEl.style.display = 'block';
		this.selectedSuggestionIndex = -1;
	}

	private hideCommandSuggestions() {
		this.commandSuggestionsEl.style.display = 'none';
		this.selectedSuggestionIndex = -1;
		this.currentSuggestions = [];
	}

	private handleSuggestionNavigation(key: string) {
		if (this.currentSuggestions.length === 0) return;

		if (key === 'ArrowDown') {
			this.selectedSuggestionIndex = Math.min(
				this.selectedSuggestionIndex + 1,
				this.currentSuggestions.length - 1
			);
		} else if (key === 'ArrowUp') {
			this.selectedSuggestionIndex = Math.max(
				this.selectedSuggestionIndex - 1,
				-1
			);
		}

		// 更新选中状态
		const items = this.commandSuggestionsEl.querySelectorAll('.command-suggestion-item');
		items.forEach((item, index) => {
			if (index === this.selectedSuggestionIndex) {
				item.addClass('selected');
			} else {
				item.removeClass('selected');
			}
		});

		// 如果选中了某个建议，自动填入
		if (this.selectedSuggestionIndex >= 0) {
			const selectedCommand = this.currentSuggestions[this.selectedSuggestionIndex];
			const value = this.inputEl.value;
			const cursorPos = this.inputEl.selectionStart;
			const beforeCursor = value.substring(0, cursorPos);
			const afterCursor = value.substring(cursorPos);

			// 找到斜杠命令的开始位置
			const slashMatch = beforeCursor.match(/\/(\w*)$/);
			if (slashMatch) {
				const commandStartPos = cursorPos - slashMatch[0].length;
				const newValue = value.substring(0, commandStartPos) + '/' + selectedCommand + afterCursor;
				this.inputEl.value = newValue;
				this.inputEl.setSelectionRange(
					commandStartPos + selectedCommand.length + 1,
					commandStartPos + selectedCommand.length + 1
				);
			}
		}
	}

	private selectSuggestion(command: string, cursorPos: number) {
		const value = this.inputEl.value;
		const beforeCursor = value.substring(0, cursorPos);
		const afterCursor = value.substring(cursorPos);

		// 找到斜杠命令的开始位置
		const slashMatch = beforeCursor.match(/\/(\w*)$/);
		if (slashMatch) {
			const commandStartPos = cursorPos - slashMatch[0].length;
			const newValue = value.substring(0, commandStartPos) + '/' + command + afterCursor;

			this.inputEl.value = newValue;

			const newCursorPos = commandStartPos + command.length + 1;
			this.inputEl.setSelectionRange(newCursorPos, newCursorPos);
		}

		this.hideCommandSuggestions();
		this.inputEl.focus();
	}

	private startNewChat() {
		// 清空输出区域
		this.outputEl.empty();
		this.outputEl.innerHTML = `<div class="ai-sidebar-welcome">${t(this.plugin.app)('ai.sidebar.newChat')}</div>`;

		// 重置会话
		this.plugin.sessionManager.startNewSession();

		new (require('obsidian').Notice)(t(this.plugin.app)('ai.sidebar.newChatStarted'));
	}

	private clearChat() {
		this.outputEl.empty();
		this.outputEl.innerHTML = `<div class="ai-sidebar-welcome">${t(this.plugin.app)('ai.sidebar.cleared')}</div>`;

		// 清除 SessionManager 中的对话历史
		this.plugin.sessionManager.clearCurrentSession();

		new (require('obsidian').Notice)(t(this.plugin.app)('ai.sidebar.chatCleared'));
	}

	private showHistory() {
		// TODO: 显示历史记录界面
		new (require('obsidian').Notice)(t(this.plugin.app)('ai.sidebar.historyInDevelopment'));
	}

	private escapeHtml(text: string): string {
		const div = document.createElement('div');
		div.textContent = text;
		return div.innerHTML;
	}

	private formatResponse(response: string): string {
		// 简单的 Markdown 格式化
		return response
			.replace(/\n/g, '<br>')
			.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
			.replace(/\*(.*?)\*/g, '<em>$1</em>');
	}

	private updateSubmitButtonState(): void {
		if (!this.submitButton) return;

		if (this.isStreaming) {
			// 流式处理中 - 只改变图标，保持按钮样式不变
			this.submitButton.innerHTML = `
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<rect x="6" y="6" width="12" height="12" rx="2"/>
				</svg>
			`;
			this.submitButton.setAttribute('title', t(this.plugin.app)('ai.sidebar.stopButton'));
		} else {
			// 正常状态 - 显示发送按钮
			this.submitButton.innerHTML = `
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<line x1="22" y1="2" x2="11" y2="13"></line>
					<polygon points="22,2 15,22 11,13 2,9 22,2"></polygon>
				</svg>
			`;
			this.submitButton.setAttribute('title', t(this.plugin.app)('ai.sidebar.sendButton'));
		}
	}

	
	private handleInputFocus(): void {
		this.updateFocusStyle();
	}

	private handleInputBlur(): void {
		this.updateFocusStyle();
	}

	private updateFocusStyle(): void {
		const inputWrapper = this.submitButton?.parentElement;
		if (!inputWrapper) return;

		const hasContent = this.inputEl.value.trim().length > 0;

		if (hasContent) {
			inputWrapper.addClass('has-content');
		} else {
			inputWrapper.removeClass('has-content');
		}
	}
}