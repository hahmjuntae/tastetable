// 응답 형태는 hackathon.api.qloo.com 실제 응답 기준(2026-10-29 확인)

export type QlooTagRef = { id: string; name: string; type: string; weight?: number | null };

export type QlooEntity = {
  name: string;
  entity_id: string;
  type?: string;
  subtype?: string; // insights 결과에만 존재, /search 는 types 배열만 반환
  types?: string[];
  popularity?: number;
  affinity?: number; // 실제 응답은 query.affinity, 문서 예시 호환용 폴백
  properties?: {
    description?: string;
    short_description?: string;
    address?: string;
    price_level?: number; // 1~4, 일부 장소는 값 없음
    business_rating?: number;
    geocode?: { name?: string; city?: string; admin1_region?: string; country_code?: string };
    image?: { url?: string };
    [key: string]: unknown;
  };
  location?: { lat: number; lon: number; geohash?: string };
  tags?: QlooTagRef[];
  query?: {
    affinity?: number;
    distance?: number; // filter.location 기준점에서 미터 단위
    explainability?: { "signal.interests.entities"?: { entity_id: string; score: number }[] };
    measurements?: Record<string, number>;
  };
};

export type QlooTagInsight = {
  tag_id: string;
  name: string;
  types?: string[];
  subtype?: string;
  tag_value?: string;
  query?: { affinity?: number };
};

export type QlooInsightsResponse = {
  success?: boolean;
  results?: { entities?: QlooEntity[]; tags?: QlooTagInsight[] };
  duration?: number;
};

export type QlooParams = Record<string, string | number | boolean | undefined>;

export type TraceEntry = {
  step: string;
  path: string;
  params: QlooParams;
  status: number;
  ms: number;
  count: number;
  mode: "live" | "mock";
};
