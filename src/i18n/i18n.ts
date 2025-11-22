import { App, moment } from 'obsidian';
import {
	SupportedLocale,
	LocaleBundle,
	TranslateFunction,
	TranslationKeys
} from './types';

// 导入优化的语言包
import { I18N_BUNDLE } from './i18n-bundle';
const zhCN = I18N_BUNDLE['zh-CN'];
const enUS = I18N_BUNDLE['en-US'];

/**
 * 国际化管理器
 * 负责语言检测、翻译函数提供和语言包管理
 */
export class I18nManager {
	private static instance: I18nManager | null = null;
	private app: App;
	private currentLocale: SupportedLocale = 'zh-CN';
	private locales: Map<SupportedLocale, LocaleBundle> = new Map();
	private translate!: TranslateFunction;

	private constructor(app: App) {
		this.app = app;
		this.loadLocales();
		this.detectLocale();
		this.createTranslateFunction();
	}

	/**
	 * 获取 I18nManager 单例实例
	 */
	public static getInstance(app: App): I18nManager {
		if (!I18nManager.instance) {
			I18nManager.instance = new I18nManager(app);
		}
		return I18nManager.instance;
	}

	/**
	 * 加载所有语言包
	 */
	private loadLocales(): void {
		try {
			this.locales.set('zh-CN', zhCN as unknown as LocaleBundle);
			this.locales.set('en-US', enUS as unknown as LocaleBundle);
		} catch (error) {
			console.error('Language bundle loading failed:', error);
		}
	}

	/**
	 * 检测当前语言环境
	 */
	private detectLocale(): void {
		try {
			// 优先使用 Obsidian 的语言设置
			const obsidianLocale = moment.locale();

			// 根据语言设置选择对应的语言包
			if (obsidianLocale.startsWith('zh')) {
				this.currentLocale = 'zh-CN';
			} else if (obsidianLocale.startsWith('en')) {
				this.currentLocale = 'en-US';
			} else {
				// 默认使用中文
				this.currentLocale = 'zh-CN';
			}

		} catch (error) {
			console.warn('Language detection failed, using default Chinese:', error);
			this.currentLocale = 'zh-CN';
		}
	}

	/**
	 * 创建翻译函数
	 */
	private createTranslateFunction(): void {
		this.translate = <K extends keyof TranslationKeys>(
			key: K,
			params?: Record<string, string | number>
		): string => {
			return this.getTranslation(key, params);
		};
	}

	/**
	 * 获取翻译文本
	 */
	private getTranslation<K extends keyof TranslationKeys>(
		key: K,
		params?: Record<string, string | number>
	): string {
		const currentBundle = this.locales.get(this.currentLocale);
		const fallbackBundle = this.locales.get('zh-CN');

		// 尝试从当前语言包获取翻译
		let translation = currentBundle?.[key];

		// 如果当前语言包没有翻译，尝试从中文包获取
		if (!translation && fallbackBundle) {
			translation = fallbackBundle[key];
		}

		// 如果都没有找到，使用键名作为回退
		if (!translation) {
			console.error(`Translation key "${key}" not found in any locale bundle`);
			translation = key;
		}

		// 处理参数替换
		if (params) {
			return this.interpolateParams(translation, params);
		}

		return translation;
	}

	/**
	 * 替换翻译文本中的参数
	 */
	private interpolateParams(
		template: string,
		params: Record<string, string | number>
	): string {
		return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
			return params[key]?.toString() || match;
		});
	}

	/**
	 * 获取翻译函数
	 */
	public t(): TranslateFunction {
		return this.translate;
	}

	/**
	 * 获取当前语言
	 */
	public getCurrentLocale(): SupportedLocale {
		return this.currentLocale;
	}

	/**
	 * 设置语言（主要用于测试）
	 */
	public setLocale(locale: SupportedLocale): void {
		if (this.locales.has(locale)) {
			this.currentLocale = locale;
			this.createTranslateFunction();
		} else {
			console.warn(`Unsupported locale: ${locale}`);
		}
	}

	/**
	 * 获取支持的语言列表
	 */
	public getSupportedLocales(): SupportedLocale[] {
		return Array.from(this.locales.keys());
	}

	/**
	 * 获取语言包信息
	 */
	public getLocaleInfo(): { current: SupportedLocale; supported: SupportedLocale[] } {
		return {
			current: this.currentLocale,
			supported: this.getSupportedLocales()
		};
	}

	/**
	 * 验证翻译键的完整性
	 */
	public validateTranslations(): void {
		const allKeys = Object.keys(this.locales.get('zh-CN') || {}) as (keyof TranslationKeys)[];
		const issues: string[] = [];

		for (const locale of this.getSupportedLocales()) {
			const bundle = this.locales.get(locale);
			if (!bundle) continue;

			for (const key of allKeys) {
				if (!bundle[key]) {
					issues.push(`Missing key "${key}" in locale "${locale}"`);
				}
			}
		}

		if (issues.length > 0) {
			console.warn('Translation completeness issues:');
			issues.forEach(issue => console.warn(`  - ${issue}`));
		}
	}
}

/**
 * 获取翻译函数的便捷方法
 */
export function t(app: App): TranslateFunction {
	return I18nManager.getInstance(app).t();
}

/**
 * 获取当前语言
 */
export function getCurrentLocale(app: App): SupportedLocale {
	return I18nManager.getInstance(app).getCurrentLocale();
}

/**
 * 设置语言
 */
export function setLocale(app: App, locale: SupportedLocale): void {
	I18nManager.getInstance(app).setLocale(locale);
}