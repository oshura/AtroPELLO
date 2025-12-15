import { DOCUMENT } from '@angular/common';
import { Inject, Injectable } from '@angular/core';
import { Meta, MetaDefinition, Title } from '@angular/platform-browser';

export type SeoPageType = 'website' | 'article' | 'profile' | 'video.other';
export type StructuredDataBlock = Record<string, unknown> | Array<Record<string, unknown>>;

export interface SeoConfig {
  title?: string;
  description?: string;
  keywords?: string[];
  url?: string;
  image?: string;
  type?: SeoPageType;
  siteName?: string;
  locale?: string;
  noindex?: boolean;
  structuredData?: StructuredDataBlock | null;
}

interface ResolvedSeoConfig {
  title: string;
  description: string;
  keywords: string[];
  url: string;
  image: string;
  type: SeoPageType;
  siteName: string;
  locale: string;
  noindex: boolean;
  structuredData?: StructuredDataBlock | null;
}

@Injectable({ providedIn: 'root' })
export class SeoService {
  private readonly baseUrl = 'https://to3.atropello-games.es';
  private readonly defaultImage = `${this.baseUrl}/assets/Wiki.png`;
  private readonly metaRobotsSelector = "name='robots'";
  private readonly dynamicStructuredDataId = 'seo-dynamic-structured-data';

  private readonly defaultConfig: ResolvedSeoConfig = {
    title: 'TO³ · AtroPELLO — WebGL Space RPG',
    description: 'Pilota la nave TO³, domina el grimorio y explora sistemas solares generados proceduralmente en tu navegador.',
    keywords: ['AtroPELLO', 'TO3', 'WebGL RPG', 'space roguelite', 'void rituals'],
    url: this.baseUrl,
    image: this.defaultImage,
    type: 'website',
    siteName: 'TO³ · AtroPELLO',
    locale: 'es_ES',
    noindex: false,
    structuredData: null
  };

  constructor(
    private readonly titleService: Title,
    private readonly meta: Meta,
    @Inject(DOCUMENT) private readonly document: Document
  ) {}

  public update(config?: SeoConfig): void {
    const resolved = this.resolveConfig(config);
    this.setTitle(resolved.title);
    this.setDescription(resolved.description);
    this.setKeywords(resolved.keywords);
    this.setRobots(resolved.noindex);
    this.updateCanonical(resolved.url);
    this.updateOpenGraph(resolved);
    this.updateTwitter(resolved);
    this.applyStructuredData(resolved.structuredData);
  }

  private resolveConfig(config?: SeoConfig): ResolvedSeoConfig {
    const keywords = this.normalizeKeywords(config?.keywords) ?? this.defaultConfig.keywords;
    const url = this.resolveAbsoluteUrl(config?.url) ?? this.defaultConfig.url;
    const image = this.resolveAbsoluteUrl(config?.image) ?? this.defaultConfig.image;

    return {
      title: config?.title?.trim() || this.defaultConfig.title,
      description: config?.description?.trim() || this.defaultConfig.description,
      keywords,
      url,
      image,
      type: config?.type ?? this.defaultConfig.type,
      siteName: config?.siteName ?? this.defaultConfig.siteName,
      locale: config?.locale ?? this.defaultConfig.locale,
      noindex: config?.noindex ?? this.defaultConfig.noindex,
      structuredData: config?.structuredData ?? null
    };
  }

  private setTitle(value: string): void {
    this.titleService.setTitle(value);
    this.upsertMeta({ property: 'og:title', content: value });
    this.upsertMeta({ name: 'twitter:title', content: value });
  }

  private setDescription(value: string): void {
    this.upsertMeta({ name: 'description', content: value });
    this.upsertMeta({ property: 'og:description', content: value });
    this.upsertMeta({ name: 'twitter:description', content: value });
  }

  private setKeywords(values: string[]): void {
    if (!values.length) {
      this.meta.removeTag("name='keywords'");
      return;
    }
    this.upsertMeta({ name: 'keywords', content: values.join(', ') });
  }

  private setRobots(noindex: boolean): void {
    const content = noindex ? 'noindex,nofollow' : 'index,follow';
    this.upsertMeta({ name: 'robots', content }, this.metaRobotsSelector);
  }

  private updateCanonical(url: string): void {
    if (!this.document) {
      return;
    }
    const head = this.document.head || this.document.getElementsByTagName('head')[0];
    if (!head) {
      return;
    }
    let link = head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!link) {
      link = this.document.createElement('link');
      link.setAttribute('rel', 'canonical');
      head.appendChild(link);
    }
    link.setAttribute('href', url);
    this.upsertMeta({ property: 'og:url', content: url });
  }

  private updateOpenGraph(config: ResolvedSeoConfig): void {
    this.upsertMeta({ property: 'og:type', content: config.type });
    this.upsertMeta({ property: 'og:site_name', content: config.siteName });
    this.upsertMeta({ property: 'og:locale', content: config.locale });
    this.upsertMeta({ property: 'og:image', content: config.image });
  }

  private updateTwitter(config: ResolvedSeoConfig): void {
    this.upsertMeta({ name: 'twitter:card', content: 'summary_large_image' });
    this.upsertMeta({ name: 'twitter:image', content: config.image });
  }

  private applyStructuredData(data?: StructuredDataBlock | null): void {
    if (!this.document) {
      return;
    }
    const head = this.document.head || this.document.getElementsByTagName('head')[0];
    if (!head) {
      return;
    }
    const existing = head.querySelector<HTMLScriptElement>(`#${this.dynamicStructuredDataId}`);
    if (!data) {
      existing?.remove();
      return;
    }
    const script = existing ?? this.document.createElement('script');
    script.type = 'application/ld+json';
    script.id = this.dynamicStructuredDataId;
    script.textContent = JSON.stringify(data);
    if (!existing) {
      head.appendChild(script);
    }
  }

  private upsertMeta(definition: MetaDefinition, selector?: string): void {
    if (selector) {
      this.meta.updateTag(definition, selector);
      return;
    }
    this.meta.updateTag(definition);
  }

  private resolveAbsoluteUrl(value?: string): string | undefined {
    if (!value) {
      return undefined;
    }
    if (/^https?:\/\//i.test(value)) {
      return value;
    }
    if (value.startsWith('/')) {
      return `${this.baseUrl}${value}`;
    }
    return `${this.baseUrl}/${value}`;
  }

  private normalizeKeywords(values?: string[]): string[] | undefined {
    if (!values || !values.length) {
      return undefined;
    }
    const normalized = Array.from(new Set(values.map(keyword => keyword.trim()).filter(Boolean)));
    return normalized.length ? normalized : undefined;
  }
}
