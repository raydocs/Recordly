import { loadAppSetting, saveAppSetting } from "@/lib/appSettings";

export interface WebcamPreviewAppearance {
	size: number;
	roundness: number;
	zoom: number;
}

export const WEBCAM_PREVIEW_APPEARANCE_STORAGE_KEY = "recordly.hud.webcamPreviewAppearance";
export const WEBCAM_PREVIEW_SIZE_RANGE = { min: 144, max: 320 } as const;
export const WEBCAM_PREVIEW_ZOOM_RANGE = { min: 1, max: 1.5 } as const;

export const DEFAULT_WEBCAM_PREVIEW_APPEARANCE: WebcamPreviewAppearance = {
	size: 208,
	roundness: 100,
	zoom: 1,
};

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

function finiteOr(value: unknown, fallback: number): number {
	return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function normalizeWebcamPreviewAppearance(value: unknown): WebcamPreviewAppearance {
	const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
	return {
		size: Math.round(
			clamp(
				finiteOr(raw.size, DEFAULT_WEBCAM_PREVIEW_APPEARANCE.size),
				WEBCAM_PREVIEW_SIZE_RANGE.min,
				WEBCAM_PREVIEW_SIZE_RANGE.max,
			),
		),
		roundness: Math.round(
			clamp(finiteOr(raw.roundness, DEFAULT_WEBCAM_PREVIEW_APPEARANCE.roundness), 0, 100),
		),
		zoom:
			Math.round(
				clamp(
					finiteOr(raw.zoom, DEFAULT_WEBCAM_PREVIEW_APPEARANCE.zoom),
					WEBCAM_PREVIEW_ZOOM_RANGE.min,
					WEBCAM_PREVIEW_ZOOM_RANGE.max,
				) * 100,
			) / 100,
	};
}

export function loadWebcamPreviewAppearance(): WebcamPreviewAppearance {
	return normalizeWebcamPreviewAppearance(
		loadAppSetting<unknown>(WEBCAM_PREVIEW_APPEARANCE_STORAGE_KEY),
	);
}

export function saveWebcamPreviewAppearance(value: WebcamPreviewAppearance): boolean {
	return saveAppSetting(
		WEBCAM_PREVIEW_APPEARANCE_STORAGE_KEY,
		normalizeWebcamPreviewAppearance(value),
	);
}
