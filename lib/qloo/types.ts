// 응답 형태는 docs.qloo.com 기준, 예시에 없는 필드는 미확인 표시 대상

export type QlooTagRef = { id: string; name: string; type: string };

export type QlooEntity = {
  name: string;
  entity_id: string;
  type?: string;
  subtype?: string;
  types?: string[]; // 미확인, search 응답 예시 없음
  popularity?: number;
  affinity?: number; // Schema 페이지 예시의 최상위 affinity 근거
  properties?: {
    description?: string;
    address?: string; // 미확인, place 응답 예시 없음
    price_level?: number; // 미확인, filter.price_level 파라미터만 문서 근거
    business_rating?: number; // 미확인, filter 파라미터만 문서 근거
    geocode?: { name?: string; admin1_region?: string; country_code?: string };
    image?: { url?: string };
    [key: string]: unknown;
  };
  location?: { lat: number; lon: number }; // 미확인, place 응답 예시 없음
  tags?: QlooTagRef[];
  query?: {
    affinity?: number; // 미확인, 결과별 affinity 위치 불명
    explainability?: unknown; // 미확인, feature.explainability 내부 형태 예시 없음
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
