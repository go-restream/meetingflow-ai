export interface ChatMessage {
	role: 'system' | 'user' | 'assistant';
	content: string;
}

export interface AiResponse {
	choices: Array<{
		message: ChatMessage;
		finish_reason: string;
	}>;
	usage?: {
		prompt_tokens: number;
		completion_tokens: number;
		total_tokens: number;
	};
}

export interface StreamingChunk {
	choices: Array<{
		delta?: {
			content?: string;
			role?: string;
		};
		finish_reason?: string;
	}>;
	usage?: {
		prompt_tokens: number;
		completion_tokens: number;
		total_tokens: number;
	};
}

export class AiClient {
	private apiKey: string;
	private apiEndpoint: string;
	private model: string;

	constructor(apiKey: string, apiEndpoint: string, model: string) {
		this.apiKey = apiKey;
		this.apiEndpoint = apiEndpoint;
		this.model = model;
	}

	updateConfig(apiKey: string, apiEndpoint: string, model: string) {
		this.apiKey = apiKey;
		this.apiEndpoint = apiEndpoint;
		this.model = model;
	}

	async processMessage(message: string, context: string, conversationHistory: ChatMessage[] = []): Promise<string> {
		if (!this.apiKey) {
			throw new Error('API 密钥未配置');
		}

		const messages: ChatMessage[] = [
			{
				role: 'system',
				content: '你是一个专业的会议助手，帮助用户处理和分析会议内容。请用中文回复，保持简洁和有用的回答。'
			},
			...conversationHistory,
			{
				role: 'user',
				content: context ? `会议内容：\n${context}\n\n用户问题：${message}` : message
			}
		];

		return this.makeApiRequest(messages);
	}

	async processMessageStream(message: string, context: string, conversationHistory: ChatMessage[] = [], onChunk?: (chunk: string) => void, signal?: AbortSignal): Promise<string> {
		if (!this.apiKey) {
			throw new Error('API 密钥未配置');
		}

		const messages: ChatMessage[] = [
			{
				role: 'system',
				content: '你是一个专业的会议助手，帮助用户处理和分析会议内容。请用中文回复，保持简洁和有用的回答。'
			},
			...conversationHistory,
			{
				role: 'user',
				content: context ? `会议内容：\n${context}\n\n用户问题：${message}` : message
			}
		];

		return this.makeStreamingApiRequest(messages, onChunk, signal);
	}

	async executeCommand(prompt: string, context: string): Promise<string> {
		if (!this.apiKey) {
			throw new Error('API 密钥未配置');
		}

		const fullPrompt = prompt.replace('{context}', context || '无上下文内容');

		const messages: ChatMessage[] = [
			{
				role: 'system',
				content: '你是一个专业的会议助手，专门处理会议相关的任务。请严格按照用户的要求进行处理，用中文回复。'
			},
			{
				role: 'user',
				content: fullPrompt
			}
		];

		return this.makeApiRequest(messages);
	}

	async executeCommandStream(prompt: string, context: string, conversationHistory: ChatMessage[] = [], onChunk?: (chunk: string) => void, signal?: AbortSignal): Promise<string> {
		if (!this.apiKey) {
			throw new Error('API 密钥未配置');
		}

		const fullPrompt = prompt.replace('{context}', context || '无上下文内容');

		const messages: ChatMessage[] = [
			{
				role: 'system',
				content: '你是一个专业的会议助手，专门处理会议相关的任务。请严格按照用户的要求进行处理，用中文回复。'
			},
			...conversationHistory,
			{
				role: 'user',
				content: fullPrompt
			}
		];

		return this.makeStreamingApiRequest(messages, onChunk, signal);
	}

	private async makeApiRequest(messages: ChatMessage[]): Promise<string> {
		try {
			const response = await fetch(this.apiEndpoint, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${this.apiKey}`
				},
				body: JSON.stringify({
					model: this.model,
					messages: messages,
					temperature: 0.7,
					max_tokens: 2000
				})
			});

			if (!response.ok) {
				const errorData = await response.json().catch(() => ({}));
				throw new Error(`API 请求失败: ${response.status} ${response.statusText} - ${errorData.error?.message || ''}`);
			}

			const data: AiResponse = await response.json();

			if (!data.choices || data.choices.length === 0) {
				throw new Error('API 返回了空响应');
			}

			return data.choices[0].message.content.trim();
		} catch (error) {
			if (error instanceof Error) {
				throw error;
			}
			throw new Error('网络请求失败');
		}
	}

	private async makeStreamingApiRequest(messages: ChatMessage[], onChunk?: (chunk: string) => void, signal?: AbortSignal): Promise<string> {
		try {
			const response = await fetch(this.apiEndpoint, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${this.apiKey}`
				},
				body: JSON.stringify({
					model: this.model,
					messages: messages,
					temperature: 0.7,
					max_tokens: 2000,
					stream: true
				}),
				signal: signal
			});

			if (!response.ok) {
				const errorData = await response.json().catch(() => ({}));
				throw new Error(`API 请求失败: ${response.status} ${response.statusText} - ${errorData.error?.message || ''}`);
			}

			if (!response.body) {
				throw new Error('响应体为空');
			}

			const reader = response.body.getReader();
			const decoder = new TextDecoder();
			let buffer = '';
			let fullContent = '';

			try {
				while (true) {
					if (signal && signal.aborted) {
						reader.cancel();
						throw new DOMException('用户取消操作', 'AbortError');
					}

					const { done, value } = await reader.read();
					if (done) break;

					buffer += decoder.decode(value, { stream: true });
					const lines = buffer.split('\n');
					buffer = lines.pop() || '';

					for (const line of lines) {
						if (signal && signal.aborted) {
							reader.cancel();
							throw new DOMException('用户取消操作', 'AbortError');
						}

						if (line.trim() === '') continue;
						if (line.startsWith('data: ')) {
							const data = line.slice(6);
							if (data.trim() === '[DONE]') {
								return fullContent.trim();
							}
							try {
								const chunk: StreamingChunk = JSON.parse(data);
								const content = chunk.choices[0]?.delta?.content;
								if (content) {
									fullContent += content;
									if (onChunk) {
										onChunk(content);
									}
								}
							} catch (e) {
								console.warn('解析流式数据失败:', e);
							}
						}
					}
				}
			} finally {
				reader.releaseLock();
			}

			return fullContent.trim();
		} catch (error) {
			if (error.name === 'AbortError') {
				throw error;
			}
			if (error instanceof Error) {
				throw error;
			}
			throw new Error('流式网络请求失败');
		}
	}

	async testConnection(): Promise<boolean> {
		if (!this.apiKey) {
			return false;
		}

		try {
			const testMessages: ChatMessage[] = [
				{
					role: 'user',
					content: '测试连接'
				}
			];

			await this.makeApiRequest(testMessages);
			return true;
		} catch (error) {
			console.error('API 连接测试失败:', error);
			return false;
		}
	}
}