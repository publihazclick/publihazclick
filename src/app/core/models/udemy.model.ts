// YouTube Data API v3 models for free courses

export interface YTSearchResult {
  id: { kind: string; videoId?: string; playlistId?: string };
  snippet: {
    title: string;
    description: string;
    thumbnails: {
      default: YTThumbnail;
      medium: YTThumbnail;
      high: YTThumbnail;
      maxres?: YTThumbnail;
    };
    channelTitle: string;
    channelId: string;
    publishedAt: string;
    liveBroadcastContent: string;
  };
}

export interface YTThumbnail {
  url: string;
  width: number;
  height: number;
}

export interface YTVideoDetails {
  id: string;
  snippet: {
    title: string;
    description: string;
    thumbnails: { medium: YTThumbnail; high: YTThumbnail; maxres?: YTThumbnail };
    channelTitle: string;
    channelId: string;
    publishedAt: string;
    tags?: string[];
  };
  contentDetails: { duration: string };
  statistics: {
    viewCount: string;
    likeCount: string;
    commentCount: string;
  };
}

export interface YTPlaylistItem {
  snippet: {
    title: string;
    description: string;
    thumbnails: { medium: YTThumbnail; high: YTThumbnail };
    channelTitle: string;
    position: number;
    resourceId: { videoId: string };
  };
}

export interface YTSearchResponse {
  nextPageToken?: string;
  prevPageToken?: string;
  pageInfo: { totalResults: number; resultsPerPage: number };
  items: YTSearchResult[];
}

export interface YTVideoResponse {
  items: YTVideoDetails[];
}

export interface YTPlaylistItemsResponse {
  nextPageToken?: string;
  pageInfo: { totalResults: number };
  items: YTPlaylistItem[];
}

/** Curso normalizado para mostrar en la UI */
export interface FreeCourse {
  id: string;
  type: 'video' | 'playlist';
  title: string;
  description: string;
  thumbnail: string;
  channelName: string;
  channelId: string;
  publishedAt: string;
  viewCount: number;
  likeCount: number;
  duration: string;
  videoCount?: number;
}

export const COURSE_SEARCH_CATEGORIES = [
  'Marketing Digital',
  'Creación de Contenido',
  'Creación de Marca',
  'Dropshipping',
  'Importación y Exportación',
  'E-commerce',
  'Redes Sociales',
  'SEO y Posicionamiento',
  'Email Marketing',
  'Google Ads',
  'Facebook Ads',
  'Diseño Gráfico',
  'Edición de Video',
  'Finanzas Personales',
  'Emprendimiento',
  'Programación',
  'Inteligencia Artificial',
] as const;

export const COURSE_SORT_OPTIONS: Record<string, string> = {
  'relevance':  'Relevancia',
  'viewCount':  'Más vistos',
  'date':       'Más recientes',
  'rating':     'Mejor valorados',
};

export const COURSE_DURATION_OPTIONS: Record<string, string> = {
  'any':    'Cualquier duración',
  'long':   'Más de 20 min',
  'medium': '4 a 20 min',
};
