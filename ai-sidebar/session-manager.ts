import { ChatMessage } from './ai-client';

export interface SessionData {
	id: string;
	notePath: string;
	messages: ChatMessage[];
	createdAt: Date;
	updatedAt: Date;
}

export class SessionManager {
	private currentSession: SessionData | null = null;
	private sessions: Map<string, SessionData> = new Map();

	constructor() {
		this.loadSessionsFromStorage();
	}

	startNewSession(notePath?: string): string {
		const sessionId = this.generateSessionId();
		const now = new Date();

		this.currentSession = {
			id: sessionId,
			notePath: notePath || '',
			messages: [],
			createdAt: now,
			updatedAt: now
		};

		this.sessions.set(sessionId, this.currentSession);
		this.saveSessionsToStorage();

		return sessionId;
	}

	getCurrentSession(): SessionData | null {
		return this.currentSession;
	}

	ensureActiveSession(): void {
		if (!this.currentSession) {
			this.startNewSession();
		}
	}

	addMessage(message: ChatMessage, maxMessages?: number): void {
		if (!this.currentSession) {
			throw new Error('没有活跃的会话');
		}

		this.currentSession.messages.push(message);
		this.currentSession.updatedAt = new Date();

		if (maxMessages && maxMessages > 0 && this.currentSession.messages.length > maxMessages) {
			this.currentSession.messages = this.currentSession.messages.slice(-maxMessages);
		}

		this.saveSessionsToStorage();
	}

	getConversationHistory(maxMessages?: number): ChatMessage[] {
		if (!this.currentSession) {
			return [];
		}

		const messages = this.currentSession.messages;
		if (maxMessages && maxMessages > 0) {
			return messages.slice(-maxMessages);
		}

		return messages;
	}

	clearCurrentSession(): void {
		if (this.currentSession) {
			this.currentSession.messages = [];
			this.currentSession.updatedAt = new Date();
			this.saveSessionsToStorage();
		}
	}

	switchToSession(sessionId: string): boolean {
		const session = this.sessions.get(sessionId);
		if (session) {
			this.currentSession = session;
			return true;
		}
		return false;
	}

	getSessionByNotePath(notePath: string): SessionData | null {
		for (const session of this.sessions.values()) {
			if (session.notePath === notePath) {
				return session;
			}
		}
		return null;
	}

	getAllSessions(): SessionData[] {
		return Array.from(this.sessions.values()).sort((a, b) =>
			b.updatedAt.getTime() - a.updatedAt.getTime()
		);
	}

	deleteSession(sessionId: string): boolean {
		const deleted = this.sessions.delete(sessionId);
		if (deleted && this.currentSession?.id === sessionId) {
			this.currentSession = null;
		}
		this.saveSessionsToStorage();
		return deleted;
	}

	cleanupOldSessions(maxAge: number = 7 * 24 * 60 * 60 * 1000): void {
		const now = new Date();
		const toDelete: string[] = [];

		for (const [sessionId, session] of this.sessions.entries()) {
			if (now.getTime() - session.updatedAt.getTime() > maxAge) {
				toDelete.push(sessionId);
			}
		}

		for (const sessionId of toDelete) {
			this.deleteSession(sessionId);
		}
	}

	private generateSessionId(): string {
		return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
	}

	private saveSessionsToStorage(): void {
		try {
			const sessionsData = Array.from(this.sessions.entries()).map(([id, session]) => [
				id,
				{
					...session,
					createdAt: session.createdAt.toISOString(),
					updatedAt: session.updatedAt.toISOString()
				}
			]);

			localStorage.setItem('ai-sidebar-sessions', JSON.stringify(sessionsData));
		} catch (error) {
			console.error('保存会话数据失败:', error);
		}
	}

	private loadSessionsFromStorage(): void {
		try {
			const stored = localStorage.getItem('ai-sidebar-sessions');
			if (!stored) {
				return;
			}

			const sessionsData: Array<[string, any]> = JSON.parse(stored);

			for (const [sessionId, sessionData] of sessionsData) {
				const session: SessionData = {
					...sessionData,
					createdAt: new Date(sessionData.createdAt),
					updatedAt: new Date(sessionData.updatedAt)
				};

				this.sessions.set(sessionId, session);
			}
		} catch (error) {
			console.error('加载会话数据失败:', error);
		}
	}

	exportSessions(): string {
		const sessionsData = Array.from(this.sessions.entries()).map(([id, session]) => [
			id,
			{
				...session,
				createdAt: session.createdAt.toISOString(),
				updatedAt: session.updatedAt.toISOString()
			}
		]);

		return JSON.stringify(sessionsData, null, 2);
	}

	importSessions(data: string): void {
		try {
			const sessionsData: Array<[string, any]> = JSON.parse(data);

			this.sessions.clear();

			for (const [sessionId, sessionData] of sessionsData) {
				const session: SessionData = {
					...sessionData,
					createdAt: new Date(sessionData.createdAt),
					updatedAt: new Date(sessionData.updatedAt)
				};

				this.sessions.set(sessionId, session);
			}

			this.currentSession = null;
			this.saveSessionsToStorage();
		} catch (error) {
			throw new Error('导入会话数据失败: ' + error.message);
		}
	}
}