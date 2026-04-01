import { Injectable, inject, signal, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { getSupabaseClient } from '../supabase.client';
import type {
  YTSearchResponse,
  YTVideoResponse,
  YTPlaylistItemsResponse,
  YTPlaylistItem,
  FreeCourse,
} from '../models/udemy.model';

const YT_API = 'https://www.googleapis.com/youtube/v3';
const CACHE_PREFIX = 'phc_yt_';
const CACHE_TTL = 12 * 60 * 60 * 1000; // 12 hours

interface CachedResult {
  courses: FreeCourse[];
  totalResults: number;
  nextPageToken: string | null;
  prevPageToken: string | null;
  timestamp: number;
}

@Injectable({ providedIn: 'root' })
export class YouTubeCursosService {
  private readonly http = inject(HttpClient);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly apiKey = environment.youtubeApiKey;
  private readonly supabase = getSupabaseClient();

  readonly loading = signal(false);
  readonly courses = signal<FreeCourse[]>([]);
  readonly totalResults = signal(0);
  readonly nextPageToken = signal<string | null>(null);
  readonly prevPageToken = signal<string | null>(null);
  readonly pageSize = 12;

  /**
   * Search courses. Priority:
   * 1. Supabase cache (server-side, shared for all users)
   * 2. YouTube API (live, saves to localStorage)
   * 3. localStorage cache (fallback)
   */
  async searchCourses(opts: {
    query?: string;
    category?: string;
    order?: string;
    duration?: string;
    pageToken?: string;
  } = {}): Promise<FreeCourse[]> {
    if (!isPlatformBrowser(this.platformId)) return [];

    this.loading.set(true);
    const category = opts.category || '';
    const query = opts.query || '';
    const searchTerm = query || category || 'Marketing Digital';

    try {
      // 1. Try YouTube API first (live, fresh results)
      const ytCourses = await this.fetchFromYouTube(searchTerm, opts);
      if (ytCourses.length > 0) {
        this.saveToBrowserCache(searchTerm, opts.pageToken, {
          courses: ytCourses,
          totalResults: this.totalResults(),
          nextPageToken: this.nextPageToken(),
          prevPageToken: this.prevPageToken(),
          timestamp: Date.now(),
        });
        return ytCourses;
      }

      // 2. Fallback: localStorage cache
      const cached = this.getFromBrowserCache(searchTerm, opts.pageToken);
      if (cached) {
        this.courses.set(cached.courses);
        this.totalResults.set(cached.totalResults);
        this.nextPageToken.set(cached.nextPageToken);
        this.prevPageToken.set(cached.prevPageToken);
        return cached.courses;
      }

      // 3. Fallback: Supabase cache (matching category)
      if (!opts.pageToken) {
        const supabaseCourses = await this.fetchFromSupabase(category, query);
        if (supabaseCourses.length > 0) {
          this.courses.set(supabaseCourses);
          this.totalResults.set(supabaseCourses.length);
          this.nextPageToken.set(null);
          this.prevPageToken.set(null);
          return supabaseCourses;
        }
      }

      // 4. Last resort: any Supabase results
      const anyCourses = await this.fetchFromSupabase('', '');
      if (anyCourses.length > 0) {
        this.courses.set(anyCourses);
        this.totalResults.set(anyCourses.length);
        this.nextPageToken.set(null);
        this.prevPageToken.set(null);
        return anyCourses;
      }

      this.courses.set([]);
      this.totalResults.set(0);
      return [];
    } catch (err) {
      console.warn('[YouTubeCursosService] Error:', err);

      // On error, try Supabase as safety net
      try {
        const fallback = await this.fetchFromSupabase(category, query);
        if (fallback.length > 0) {
          this.courses.set(fallback);
          this.totalResults.set(fallback.length);
          this.nextPageToken.set(null);
          this.prevPageToken.set(null);
          return fallback;
        }
      } catch {}

      this.courses.set([]);
      return [];
    } finally {
      this.loading.set(false);
    }
  }

  // ── Supabase cache ─────────────────────────────────────────────

  private async fetchFromSupabase(category: string, query: string): Promise<FreeCourse[]> {
    try {
      // Exact category match
      if (category) {
        const { data } = await this.supabase
          .from('youtube_courses_cache')
          .select('*')
          .eq('category', category)
          .order('view_count', { ascending: false })
          .limit(this.pageSize);
        if (data?.length) return this.mapSupabaseToFreeCourse(data);
      }

      // Text search on title
      if (query) {
        const { data } = await this.supabase
          .from('youtube_courses_cache')
          .select('*')
          .ilike('title', `%${query}%`)
          .order('view_count', { ascending: false })
          .limit(this.pageSize);
        if (data?.length) return this.mapSupabaseToFreeCourse(data);
      }

      // No filters: return all sorted by views
      const { data } = await this.supabase
        .from('youtube_courses_cache')
        .select('*')
        .order('view_count', { ascending: false })
        .limit(this.pageSize);

      return data?.length ? this.mapSupabaseToFreeCourse(data) : [];
    } catch {
      return [];
    }
  }

  private mapSupabaseToFreeCourse(rows: any[]): FreeCourse[] {
    return rows.map(r => ({
      id: r.video_id,
      type: 'video' as const,
      title: r.title,
      description: r.description ?? '',
      thumbnail: r.thumbnail ?? '',
      channelName: r.channel_name ?? '',
      channelId: r.channel_id ?? '',
      publishedAt: r.published_at ?? '',
      viewCount: r.view_count ?? 0,
      likeCount: r.like_count ?? 0,
      duration: r.duration ?? '',
    }));
  }

  // ── YouTube API ────────────────────────────────────────────────

  private async fetchFromYouTube(
    searchTerm: string,
    opts: { order?: string; duration?: string; pageToken?: string },
  ): Promise<FreeCourse[]> {
    const fullQuery = `curso completo gratis ${searchTerm}`;

    let params = new HttpParams()
      .set('part', 'snippet')
      .set('type', 'video')
      .set('q', fullQuery)
      .set('maxResults', this.pageSize.toString())
      .set('order', opts.order ?? 'relevance')
      .set('relevanceLanguage', 'es')
      .set('safeSearch', 'strict')
      .set('key', this.apiKey);

    if (opts.duration && opts.duration !== 'any') {
      params = params.set('videoDuration', opts.duration);
    }
    if (opts.pageToken) {
      params = params.set('pageToken', opts.pageToken);
    }

    const searchRes = await firstValueFrom(
      this.http.get<YTSearchResponse>(`${YT_API}/search`, { params })
    );

    this.nextPageToken.set(searchRes.nextPageToken ?? null);
    this.prevPageToken.set(searchRes.prevPageToken ?? null);
    this.totalResults.set(searchRes.pageInfo.totalResults);

    if (!searchRes.items?.length) {
      this.courses.set([]);
      return [];
    }

    const videoIds = searchRes.items
      .filter(i => i.id.videoId)
      .map(i => i.id.videoId!)
      .join(',');

    const detailParams = new HttpParams()
      .set('part', 'snippet,contentDetails,statistics')
      .set('id', videoIds)
      .set('key', this.apiKey);

    const detailRes = await firstValueFrom(
      this.http.get<YTVideoResponse>(`${YT_API}/videos`, { params: detailParams })
    );

    const courses: FreeCourse[] = (detailRes.items ?? []).map(v => ({
      id: v.id,
      type: 'video' as const,
      title: this.decodeHtml(v.snippet.title),
      description: v.snippet.description?.substring(0, 200) ?? '',
      thumbnail: v.snippet.thumbnails.high?.url ?? v.snippet.thumbnails.medium?.url ?? '',
      channelName: v.snippet.channelTitle,
      channelId: v.snippet.channelId,
      publishedAt: v.snippet.publishedAt,
      viewCount: parseInt(v.statistics.viewCount ?? '0', 10),
      likeCount: parseInt(v.statistics.likeCount ?? '0', 10),
      duration: this.parseDuration(v.contentDetails.duration),
    }));

    this.courses.set(courses);
    return courses;
  }

  // ── Browser localStorage cache ─────────────────────────────────

  private buildCacheKey(search: string, pageToken?: string): string {
    return CACHE_PREFIX + this.hashCode(`${search}|${pageToken ?? ''}`);
  }

  private saveToBrowserCache(search: string, pageToken: string | undefined, data: CachedResult): void {
    try {
      localStorage.setItem(this.buildCacheKey(search, pageToken), JSON.stringify(data));
    } catch {
      this.cleanOldCache();
      try { localStorage.setItem(this.buildCacheKey(search, pageToken), JSON.stringify(data)); } catch {}
    }
  }

  private getFromBrowserCache(search: string, pageToken?: string): CachedResult | null {
    try {
      const raw = localStorage.getItem(this.buildCacheKey(search, pageToken));
      if (!raw) return null;
      const data: CachedResult = JSON.parse(raw);
      // Use cache even if expired (better than nothing)
      if (!data.courses?.length) return null;
      return data;
    } catch {
      return null;
    }
  }

  private cleanOldCache(): void {
    try {
      const keys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(CACHE_PREFIX)) keys.push(key);
      }
      // Remove oldest half
      keys.slice(0, Math.ceil(keys.length / 2)).forEach(k => localStorage.removeItem(k));
    } catch {}
  }

  private hashCode(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash).toString(36);
  }

  // ── Public helpers ─────────────────────────────────────────────

  async getPlaylistVideos(playlistId: string): Promise<YTPlaylistItem[]> {
    const params = new HttpParams()
      .set('part', 'snippet')
      .set('playlistId', playlistId)
      .set('maxResults', '50')
      .set('key', this.apiKey);
    try {
      const res = await firstValueFrom(
        this.http.get<YTPlaylistItemsResponse>(`${YT_API}/playlistItems`, { params })
      );
      return res.items ?? [];
    } catch { return []; }
  }

  parseDuration(iso: string): string {
    if (!iso) return '';
    const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return '';
    const h = parseInt(match[1] ?? '0', 10);
    const m = parseInt(match[2] ?? '0', 10);
    const s = parseInt(match[3] ?? '0', 10);
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  }

  formatViews(count: number): string {
    if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
    if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
    return count.toString();
  }

  formatTimeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const days = Math.floor(diff / 86_400_000);
    if (days < 1) return 'Hoy';
    if (days < 30) return `Hace ${days}d`;
    if (days < 365) return `Hace ${Math.floor(days / 30)} meses`;
    return `Hace ${Math.floor(days / 365)} años`;
  }

  private decodeHtml(html: string): string {
    const txt = document.createElement('textarea');
    txt.innerHTML = html;
    return txt.value;
  }
}
