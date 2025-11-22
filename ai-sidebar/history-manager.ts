import { ChatMessage } from './ai-client';

export interface HistoryItem {
	id: string;
	type: 'command' | 'chat';
	input: string;
	output: string;
	context: string;
	timestamp: Date;
	sessionId?: string;
	notePath?: string;
}

export class HistoryManager {
	private historyItems: HistoryItem[] = [];
	private maxItems: number;

	constructor(maxItems: number = 50) {
		this.maxItems = maxItems;
		this.loadHistoryFromStorage();
	}

	async addToHistory(item: Omit<HistoryItem, 'id' | 'timestamp'>): Promise<void> {
		const historyItem: HistoryItem = {
			...item,
			id: this.generateId(),
			timestamp: new Date()
		};

		this.historyItems.unshift(historyItem);

		if (this.historyItems.length > this.maxItems) {
			this.historyItems = this.historyItems.slice(0, this.maxItems);
		}

		this.saveHistoryToStorage();
	}

	getHistoryItems(): HistoryItem[] {
		return [...this.historyItems];
	}

	getHistoryItemsByType(type: 'command' | 'chat'): HistoryItem[] {
		return this.historyItems.filter(item => item.type === type);
	}

	getHistoryItemsBySession(sessionId: string): HistoryItem[] {
		return this.historyItems.filter(item => item.sessionId === sessionId);
	}

	getHistoryItemsByNote(notePath: string): HistoryItem[] {
		return this.historyItems.filter(item => item.notePath === notePath);
	}

	searchHistory(query: string): HistoryItem[] {
		const lowerQuery = query.toLowerCase();
		return this.historyItems.filter(item =>
			item.input.toLowerCase().includes(lowerQuery) ||
			item.output.toLowerCase().includes(lowerQuery) ||
			item.context.toLowerCase().includes(lowerQuery)
		);
	}

	deleteHistoryItem(id: string): boolean {
		const index = this.historyItems.findIndex(item => item.id === id);
		if (index !== -1) {
			this.historyItems.splice(index, 1);
			this.saveHistoryToStorage();
			return true;
		}
		return false;
	}

	clearHistory(): void {
		this.historyItems = [];
		this.saveHistoryToStorage();
	}

	clearHistoryByType(type: 'command' | 'chat'): void {
		this.historyItems = this.historyItems.filter(item => item.type !== type);
		this.saveHistoryToStorage();
	}

	clearHistoryBySession(sessionId: string): void {
		this.historyItems = this.historyItems.filter(item => item.sessionId !== sessionId);
		this.saveHistoryToStorage();
	}

	getHistoryStats(): {
		total: number;
		commands: number;
		chats: number;
		oldestDate: Date | null;
		newestDate: Date | null;
	} {
		const commands = this.historyItems.filter(item => item.type === 'command').length;
		const chats = this.historyItems.filter(item => item.type === 'chat').length;

		let oldestDate: Date | null = null;
		let newestDate: Date | null = null;

		if (this.historyItems.length > 0) {
			oldestDate = this.historyItems[this.historyItems.length - 1].timestamp;
			newestDate = this.historyItems[0].timestamp;
		}

		return {
			total: this.historyItems.length,
			commands,
			chats,
			oldestDate,
			newestDate
		};
	}

	private generateId(): string {
		return 'hist_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
	}

	private saveHistoryToStorage(): void {
		try {
			const historyData = this.historyItems.map(item => ({
				...item,
				timestamp: item.timestamp.toISOString()
			}));

			localStorage.setItem('ai-sidebar-history', JSON.stringify(historyData));
		} catch (error) {
			console.error('保存历史记录失败:', error);
		}
	}

	async loadHistoryFromStorage(): Promise<void> {
		try {
			const stored = localStorage.getItem('ai-sidebar-history');
			if (!stored) {
				return;
			}

			const historyData: any[] = JSON.parse(stored);

			this.historyItems = historyData.map(item => ({
				...item,
				timestamp: new Date(item.timestamp)
			}));
		} catch (error) {
			console.error('加载历史记录失败:', error);
			this.historyItems = [];
		}
	}

	exportHistory(): string {
		const historyData = this.historyItems.map(item => ({
			...item,
			timestamp: item.timestamp.toISOString()
		}));

		return JSON.stringify(historyData, null, 2);
	}

	importHistory(data: string): void {
		try {
			const historyData: any[] = JSON.parse(data);

			this.historyItems = historyData.map(item => ({
				...item,
				timestamp: new Date(item.timestamp)
			}));

			if (this.historyItems.length > this.maxItems) {
				this.historyItems = this.historyItems.slice(0, this.maxItems);
			}

			this.saveHistoryToStorage();
		} catch (error) {
			throw new Error('导入历史记录失败: ' + error.message);
		}
	}

	updateMaxItems(maxItems: number): void {
		this.maxItems = maxItems;
		if (this.historyItems.length > maxItems) {
			this.historyItems = this.historyItems.slice(0, maxItems);
			this.saveHistoryToStorage();
		}
	}
}