import { describe, expect, it } from "vitest";
import {
	DEFAULT_WEBCAM_PREVIEW_APPEARANCE,
	normalizeWebcamPreviewAppearance,
} from "./webcamPreviewAppearance";

describe("normalizeWebcamPreviewAppearance", () => {
	it("uses a compact circular preview without extra crop zoom by default", () => {
		expect(normalizeWebcamPreviewAppearance(null)).toEqual(DEFAULT_WEBCAM_PREVIEW_APPEARANCE);
	});

	it("clamps invalid persisted values", () => {
		expect(
			normalizeWebcamPreviewAppearance({ size: 999, roundness: -20, zoom: 1.876 }),
		).toEqual({ size: 320, roundness: 0, zoom: 1.5 });
		expect(normalizeWebcamPreviewAppearance({ size: Number.NaN, zoom: "large" })).toEqual(
			DEFAULT_WEBCAM_PREVIEW_APPEARANCE,
		);
	});

	it("rounds settings to stable persisted precision", () => {
		expect(
			normalizeWebcamPreviewAppearance({ size: 207.6, roundness: 64.7, zoom: 1.234 }),
		).toEqual({ size: 208, roundness: 65, zoom: 1.23 });
	});
});
