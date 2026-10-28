/** Style renders (issue 195) as the API returns them */
export interface RenderInfo {
  id: string;
  project_id: string;
  user_id: string | null;
  style: string;
  style_name: string;
  shot: string;
  shot_name: string;
  provider: string;
  public: number;
  created_at: number;
}

export interface RenderConfig {
  provider: string;
  /** Passes the provider is conditioned on */
  passes: ('color' | 'depth' | 'lines' | 'mask')[];
  /** Credits per image */
  credits: number;
  /** No image model configured yet: images are illustrations made from the 3D view */
  placeholder: boolean;
}

export const renderImageUrl = (id: string, which: 'image' | 'source' = 'image') => `/api/renders/${id}/${which}`;
