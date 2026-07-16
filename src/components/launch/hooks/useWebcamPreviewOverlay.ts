import { type PointerEvent, useCallback, useEffect, useRef, useState } from "react";
import { canShowFloatingWebcamPreview } from "../floatingWebcamPreview";
import { clampHudOffsetToViewport } from "../hudViewportBounds";
import {
	cacheWebcamPreviewAppearance,
	loadWebcamPreviewAppearance,
	normalizeWebcamPreviewAppearance,
	saveWebcamPreviewAppearance,
	type WebcamPreviewAppearance,
} from "../webcamPreviewAppearance";
import {
	loadWebcamPreviewPlacement,
	resolveRestoredPreviewPlacement,
	saveWebcamPreviewPlacement,
	type WebcamPreviewPlacement,
} from "../webcamPreviewPlacement";

const WEBCAM_PREVIEW_DRAG_THRESHOLD = 6;
const DEFAULT_VIDEO_ASPECT = 16 / 9;
const APPEARANCE_SAVE_DEBOUNCE_MS = 200;
const PLACEMENT_SAVE_DEBOUNCE_MS = 250;

interface InitialWebcamPreviewState {
	appearance: WebcamPreviewAppearance;
	offset: { x: number; y: number };
	visible: boolean;
}

function createInitialWebcamPreviewState(): InitialWebcamPreviewState {
	const appearance = loadWebcamPreviewAppearance();
	const placement = resolveRestoredPreviewPlacement(
		loadWebcamPreviewPlacement(),
		{ width: window.innerWidth, height: window.innerHeight },
		appearance.size,
	);
	return {
		appearance,
		offset: { x: placement.offsetX, y: placement.offsetY },
		visible: placement.visible,
	};
}

function isDeviceConstraintError(error: unknown): boolean {
	const name =
		error instanceof DOMException ? error.name : error instanceof Error ? error.name : "";
	return name === "OverconstrainedError" || name === "NotFoundError";
}

function isNotAllowedError(error: unknown): boolean {
	const name =
		error instanceof DOMException ? error.name : error instanceof Error ? error.name : "";
	return name === "NotAllowedError";
}

function buildPreviewVideoConstraints(deviceId?: string): MediaTrackConstraints {
	const base: MediaTrackConstraints = {
		width: { ideal: 640 },
		height: { ideal: 360 },
		aspectRatio: { ideal: 16 / 9 },
		frameRate: { ideal: 24, max: 30 },
	};
	if (deviceId) {
		return { ...base, deviceId: { exact: deviceId } };
	}
	return base;
}

export function useWebcamPreviewOverlay({
	webcamEnabled,
	webcamDeviceId,
	showWebcamControls,
	webcamPopoverOpen,
	hudOverlayMousePassthroughSupported,
	onWebcamPreviewUnavailable,
}: {
	webcamEnabled: boolean;
	webcamDeviceId?: string;
	showWebcamControls: boolean;
	webcamPopoverOpen: boolean;
	hudOverlayMousePassthroughSupported: boolean | null;
	onWebcamPreviewUnavailable?: () => void;
}) {
	const initialStateRef = useRef<InitialWebcamPreviewState | null>(null);
	if (initialStateRef.current === null) {
		initialStateRef.current = createInitialWebcamPreviewState();
	}
	const initialState = initialStateRef.current;

	const [showFloatingWebcamPreview, setShowFloatingWebcamPreview] = useState(
		initialState.visible,
	);
	const [webcamPreviewAppearance, setWebcamPreviewAppearance] = useState(initialState.appearance);
	const [webcamPreviewOffset, setWebcamPreviewOffset] = useState(initialState.offset);
	const [videoAspect, setVideoAspect] = useState(DEFAULT_VIDEO_ASPECT);
	const webcamPreviewOffsetRef = useRef(initialState.offset);
	const webcamPreviewAppearanceRef = useRef(webcamPreviewAppearance);
	const appearanceSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const pendingAppearanceSaveRef = useRef<WebcamPreviewAppearance | null>(null);
	const placementSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const pendingPlacementSaveRef = useRef<WebcamPreviewPlacement | null>(null);
	const previewVideoNodesRef = useRef(new Set<HTMLVideoElement>());
	const metadataListenerByNodeRef = useRef(new Map<HTMLVideoElement, () => void>());
	const recordingWebcamPreviewContainerRef = useRef<HTMLDivElement | null>(null);
	const previewStreamRef = useRef<MediaStream | null>(null);
	const previewDragMoveRafRef = useRef<number | null>(null);
	const previewDragPendingPointerRef = useRef<{ clientX: number; clientY: number } | null>(null);
	const webcamPreviewPassthroughHeldRef = useRef(false);
	const previewUnavailableNotifiedRef = useRef(false);
	const onWebcamPreviewUnavailableRef = useRef(onWebcamPreviewUnavailable);
	onWebcamPreviewUnavailableRef.current = onWebcamPreviewUnavailable;

	webcamPreviewAppearanceRef.current = webcamPreviewAppearance;
	const webcamPreviewDragStartRef = useRef<{
		pointerId: number;
		startX: number;
		startY: number;
		originX: number;
		originY: number;
		initialLeft: number;
		initialTop: number;
		previewWidth: number;
		previewHeight: number;
		dragging: boolean;
	} | null>(null);
	const isWebcamPreviewDraggingRef = useRef(false);
	const showRecordingWebcamPreview =
		webcamEnabled &&
		canShowFloatingWebcamPreview(
			showFloatingWebcamPreview,
			hudOverlayMousePassthroughSupported,
		);
	const shouldStreamWebcamPreview =
		webcamEnabled && (showRecordingWebcamPreview || (showWebcamControls && webcamPopoverOpen));

	const holdHudPassthrough = useCallback(() => {
		window.electronAPI?.hudOverlaySetIgnoreMouse?.(false);
		webcamPreviewPassthroughHeldRef.current = true;
	}, []);

	const releaseHudPassthrough = useCallback(() => {
		if (!webcamPreviewPassthroughHeldRef.current) {
			return;
		}
		window.electronAPI?.hudOverlaySetIgnoreMouse?.(true);
		webcamPreviewPassthroughHeldRef.current = false;
	}, []);

	const flushWebcamPreviewAppearanceSave = useCallback(() => {
		if (appearanceSaveTimerRef.current !== null) {
			clearTimeout(appearanceSaveTimerRef.current);
			appearanceSaveTimerRef.current = null;
		}
		const pending = pendingAppearanceSaveRef.current;
		if (pending !== null) {
			saveWebcamPreviewAppearance(pending);
			pendingAppearanceSaveRef.current = null;
		}
	}, []);

	const flushWebcamPreviewPlacementSave = useCallback(() => {
		if (placementSaveTimerRef.current !== null) {
			clearTimeout(placementSaveTimerRef.current);
			placementSaveTimerRef.current = null;
		}
		const pending = pendingPlacementSaveRef.current;
		if (pending !== null) {
			saveWebcamPreviewPlacement(pending);
			pendingPlacementSaveRef.current = null;
		}
	}, []);

	const updateWebcamPreviewAppearance = useCallback((patch: Partial<WebcamPreviewAppearance>) => {
		const next = normalizeWebcamPreviewAppearance({
			...webcamPreviewAppearanceRef.current,
			...patch,
		});
		webcamPreviewAppearanceRef.current = next;
		cacheWebcamPreviewAppearance(next);
		setWebcamPreviewAppearance(next);

		// Keep UI live; debounce the sync IPC disk write (~200ms trailing).
		pendingAppearanceSaveRef.current = next;
		if (appearanceSaveTimerRef.current !== null) {
			clearTimeout(appearanceSaveTimerRef.current);
		}
		appearanceSaveTimerRef.current = setTimeout(() => {
			appearanceSaveTimerRef.current = null;
			const pending = pendingAppearanceSaveRef.current;
			if (pending !== null) {
				saveWebcamPreviewAppearance(pending);
				pendingAppearanceSaveRef.current = null;
			}
		}, APPEARANCE_SAVE_DEBOUNCE_MS);
	}, []);

	useEffect(() => {
		return () => {
			flushWebcamPreviewAppearanceSave();
		};
	}, [flushWebcamPreviewAppearanceSave]);

	useEffect(() => {
		pendingPlacementSaveRef.current = {
			offsetX: webcamPreviewOffset.x,
			offsetY: webcamPreviewOffset.y,
			visible: showFloatingWebcamPreview,
		};
		if (placementSaveTimerRef.current !== null) {
			clearTimeout(placementSaveTimerRef.current);
		}
		placementSaveTimerRef.current = setTimeout(() => {
			placementSaveTimerRef.current = null;
			const pending = pendingPlacementSaveRef.current;
			if (pending !== null) {
				saveWebcamPreviewPlacement(pending);
				pendingPlacementSaveRef.current = null;
			}
		}, PLACEMENT_SAVE_DEBOUNCE_MS);

		return () => {
			// Cleanup only clears the timer; flush on unmount is separate so
			// dependency changes do not write intermediate states twice.
			if (placementSaveTimerRef.current !== null) {
				clearTimeout(placementSaveTimerRef.current);
				placementSaveTimerRef.current = null;
			}
		};
	}, [webcamPreviewOffset, showFloatingWebcamPreview]);

	useEffect(() => {
		return () => {
			flushWebcamPreviewPlacementSave();
		};
	}, [flushWebcamPreviewPlacementSave]);

	// Webcam off: clear drag state only — position and visibility stay sticky.
	useEffect(() => {
		if (!webcamEnabled) {
			webcamPreviewDragStartRef.current = null;
			isWebcamPreviewDraggingRef.current = false;
			if (previewDragMoveRafRef.current !== null) {
				cancelAnimationFrame(previewDragMoveRafRef.current);
				previewDragMoveRafRef.current = null;
			}
			previewDragPendingPointerRef.current = null;
			releaseHudPassthrough();
		} else {
			previewUnavailableNotifiedRef.current = false;
		}
	}, [webcamEnabled, releaseHudPassthrough]);

	// Passthrough fail-safe: restore click-through if a gesture is interrupted.
	useEffect(() => {
		const restoreIfHeld = () => {
			releaseHudPassthrough();
		};

		const onBlur = () => {
			restoreIfHeld();
		};
		const onVisibilityChange = () => {
			if (document.visibilityState === "hidden") {
				restoreIfHeld();
			}
		};

		window.addEventListener("blur", onBlur);
		document.addEventListener("visibilitychange", onVisibilityChange);
		return () => {
			window.removeEventListener("blur", onBlur);
			document.removeEventListener("visibilitychange", onVisibilityChange);
			restoreIfHeld();
		};
	}, [releaseHudPassthrough]);

	const keepWebcamPreviewInsideViewport = useCallback(() => {
		if (isWebcamPreviewDraggingRef.current || !recordingWebcamPreviewContainerRef.current) {
			return;
		}

		const bounds = recordingWebcamPreviewContainerRef.current.getBoundingClientRect();
		const nextOffset = clampHudOffsetToViewport(webcamPreviewOffsetRef.current, bounds, {
			width: window.innerWidth,
			height: window.innerHeight,
		});
		if (
			nextOffset.x === webcamPreviewOffsetRef.current.x &&
			nextOffset.y === webcamPreviewOffsetRef.current.y
		) {
			return;
		}

		webcamPreviewOffsetRef.current = nextOffset;
		recordingWebcamPreviewContainerRef.current.style.transform = `translate(${nextOffset.x}px, ${nextOffset.y}px)`;
		setWebcamPreviewOffset(nextOffset);
	}, []);

	useEffect(() => {
		window.addEventListener("resize", keepWebcamPreviewInsideViewport);
		return () => {
			window.removeEventListener("resize", keepWebcamPreviewInsideViewport);
		};
	}, [keepWebcamPreviewInsideViewport]);

	const handleWebcamPreviewPointerDown = useCallback(
		(event: PointerEvent<HTMLDivElement>) => {
			if (event.button !== 0) {
				return;
			}

			const previewRect = event.currentTarget.getBoundingClientRect();

			event.preventDefault();
			holdHudPassthrough();
			webcamPreviewDragStartRef.current = {
				pointerId: event.pointerId,
				startX: event.clientX,
				startY: event.clientY,
				originX: webcamPreviewOffsetRef.current.x,
				originY: webcamPreviewOffsetRef.current.y,
				initialLeft: previewRect.left,
				initialTop: previewRect.top,
				previewWidth: previewRect.width,
				previewHeight: previewRect.height,
				dragging: false,
			};
			event.currentTarget.setPointerCapture(event.pointerId);
		},
		[holdHudPassthrough],
	);

	const handleWebcamPreviewPointerMove = useCallback((event: PointerEvent<HTMLDivElement>) => {
		const dragState = webcamPreviewDragStartRef.current;
		if (!dragState || dragState.pointerId !== event.pointerId) {
			return;
		}

		const deltaX = event.clientX - dragState.startX;
		const deltaY = event.clientY - dragState.startY;

		if (!dragState.dragging && Math.hypot(deltaX, deltaY) < WEBCAM_PREVIEW_DRAG_THRESHOLD) {
			return;
		}

		if (!dragState.dragging) {
			dragState.dragging = true;
			isWebcamPreviewDraggingRef.current = true;
		}

		previewDragPendingPointerRef.current = { clientX: event.clientX, clientY: event.clientY };
		if (previewDragMoveRafRef.current !== null) {
			return;
		}

		previewDragMoveRafRef.current = requestAnimationFrame(() => {
			previewDragMoveRafRef.current = null;
			const latestDragState = webcamPreviewDragStartRef.current;
			const pointer = previewDragPendingPointerRef.current;
			if (!latestDragState || !pointer) {
				return;
			}

			const latestDeltaX = pointer.clientX - latestDragState.startX;
			const latestDeltaY = pointer.clientY - latestDragState.startY;
			const viewportWidth = window.innerWidth;
			const viewportHeight = window.innerHeight;
			const unclampedLeft = latestDragState.initialLeft + latestDeltaX;
			const unclampedTop = latestDragState.initialTop + latestDeltaY;
			const clampedLeft = Math.min(
				Math.max(0, unclampedLeft),
				Math.max(0, viewportWidth - latestDragState.previewWidth),
			);
			const clampedTop = Math.min(
				Math.max(0, unclampedTop),
				Math.max(0, viewportHeight - latestDragState.previewHeight),
			);

			const nextOffset = {
				x: latestDragState.originX + (clampedLeft - latestDragState.initialLeft),
				y: latestDragState.originY + (clampedTop - latestDragState.initialTop),
			};
			webcamPreviewOffsetRef.current = nextOffset;
			if (recordingWebcamPreviewContainerRef.current) {
				recordingWebcamPreviewContainerRef.current.style.transform = `translate(${nextOffset.x}px, ${nextOffset.y}px)`;
			}
		});
	}, []);

	const handleWebcamPreviewPointerUp = useCallback(
		(event: PointerEvent<HTMLDivElement>) => {
			const dragState = webcamPreviewDragStartRef.current;
			if (!dragState || dragState.pointerId !== event.pointerId) {
				return;
			}
			if (previewDragMoveRafRef.current !== null) {
				cancelAnimationFrame(previewDragMoveRafRef.current);
				previewDragMoveRafRef.current = null;
			}
			previewDragPendingPointerRef.current = null;

			const wasDragging = dragState.dragging;
			webcamPreviewDragStartRef.current = null;
			isWebcamPreviewDraggingRef.current = false;
			setWebcamPreviewOffset({ ...webcamPreviewOffsetRef.current });
			if (event.currentTarget.hasPointerCapture(event.pointerId)) {
				event.currentTarget.releasePointerCapture(event.pointerId);
			}
			if (wasDragging) {
				releaseHudPassthrough();
			}
		},
		[releaseHudPassthrough],
	);

	const syncVideoAspectFromNode = useCallback((videoElement: HTMLVideoElement) => {
		const { videoWidth, videoHeight } = videoElement;
		if (videoWidth <= 0 || videoHeight <= 0) {
			return;
		}
		const nextAspect = videoWidth / videoHeight;
		setVideoAspect((current) => (current === nextAspect ? current : nextAspect));
	}, []);

	const detachVideoAspectListener = useCallback((videoElement: HTMLVideoElement) => {
		const listener = metadataListenerByNodeRef.current.get(videoElement);
		if (!listener) {
			return;
		}
		videoElement.removeEventListener("loadedmetadata", listener);
		metadataListenerByNodeRef.current.delete(videoElement);
	}, []);

	const attachVideoAspectListener = useCallback(
		(videoElement: HTMLVideoElement) => {
			if (metadataListenerByNodeRef.current.has(videoElement)) {
				syncVideoAspectFromNode(videoElement);
				return;
			}
			const onLoadedMetadata = () => {
				syncVideoAspectFromNode(videoElement);
			};
			videoElement.addEventListener("loadedmetadata", onLoadedMetadata);
			metadataListenerByNodeRef.current.set(videoElement, onLoadedMetadata);
			syncVideoAspectFromNode(videoElement);
		},
		[syncVideoAspectFromNode],
	);

	const attachPreviewStreamToNode = useCallback(
		(videoElement: HTMLVideoElement | null) => {
			const previewStream = previewStreamRef.current;
			if (!videoElement || !previewStream || videoElement.srcObject === previewStream) {
				return;
			}

			videoElement.srcObject = previewStream;
			attachVideoAspectListener(videoElement);
			const playPromise = videoElement.play();
			if (playPromise) {
				playPromise.catch(() => {
					// Ignore autoplay interruptions while the preview element mounts.
				});
			}
		},
		[attachVideoAspectListener],
	);

	type PreviewVideoSlot =
		| "popoverFrame"
		| "popoverBackdrop"
		| "floatingFrame"
		| "floatingBackdrop";

	const previewVideoSlotsRef = useRef<Record<PreviewVideoSlot, HTMLVideoElement | null>>({
		popoverFrame: null,
		popoverBackdrop: null,
		floatingFrame: null,
		floatingBackdrop: null,
	});

	const registerPreviewVideoNode = useCallback(
		(slot: PreviewVideoSlot, node: HTMLVideoElement | null) => {
			const previous = previewVideoSlotsRef.current[slot];
			if (previous && previous !== node) {
				previewVideoNodesRef.current.delete(previous);
				detachVideoAspectListener(previous);
				previous.pause();
				previous.srcObject = null;
			}
			previewVideoSlotsRef.current[slot] = node;
			if (node) {
				previewVideoNodesRef.current.add(node);
				attachVideoAspectListener(node);
				attachPreviewStreamToNode(node);
			}
		},
		[attachPreviewStreamToNode, attachVideoAspectListener, detachVideoAspectListener],
	);

	const setWebcamPreviewNode = useCallback(
		(node: HTMLVideoElement | null) => {
			registerPreviewVideoNode("popoverFrame", node);
		},
		[registerPreviewVideoNode],
	);

	const setWebcamPreviewBackdropNode = useCallback(
		(node: HTMLVideoElement | null) => {
			registerPreviewVideoNode("popoverBackdrop", node);
		},
		[registerPreviewVideoNode],
	);

	const setRecordingWebcamPreviewNode = useCallback(
		(node: HTMLVideoElement | null) => {
			registerPreviewVideoNode("floatingFrame", node);
		},
		[registerPreviewVideoNode],
	);

	const setRecordingWebcamPreviewBackdropNode = useCallback(
		(node: HTMLVideoElement | null) => {
			registerPreviewVideoNode("floatingBackdrop", node);
		},
		[registerPreviewVideoNode],
	);

	useEffect(() => {
		return () => {
			if (previewDragMoveRafRef.current !== null) {
				cancelAnimationFrame(previewDragMoveRafRef.current);
			}
			previewDragMoveRafRef.current = null;
			previewDragPendingPointerRef.current = null;
		};
	}, []);

	useEffect(() => {
		const previewSize = webcamPreviewAppearance.size;
		const timeoutId = window.setTimeout(() => {
			const preview = recordingWebcamPreviewContainerRef.current;
			if (!preview) return;

			const rect = preview.getBoundingClientRect();
			const clampedLeft = Math.min(
				Math.max(0, rect.left),
				Math.max(0, window.innerWidth - previewSize),
			);
			const clampedTop = Math.min(
				Math.max(0, rect.top),
				Math.max(0, window.innerHeight - previewSize),
			);
			const correctionX = clampedLeft - rect.left;
			const correctionY = clampedTop - rect.top;
			if (Math.abs(correctionX) < 0.5 && Math.abs(correctionY) < 0.5) return;

			const nextOffset = {
				x: webcamPreviewOffsetRef.current.x + correctionX,
				y: webcamPreviewOffsetRef.current.y + correctionY,
			};
			webcamPreviewOffsetRef.current = nextOffset;
			preview.style.transform = `translate(${nextOffset.x}px, ${nextOffset.y}px)`;
			setWebcamPreviewOffset(nextOffset);
		}, 200);

		return () => window.clearTimeout(timeoutId);
	}, [webcamPreviewAppearance.size]);

	useEffect(() => {
		let mounted = true;

		const notifyUnavailable = () => {
			if (previewUnavailableNotifiedRef.current) {
				return;
			}
			previewUnavailableNotifiedRef.current = true;
			onWebcamPreviewUnavailableRef.current?.();
		};

		const startPreview = async () => {
			if (!shouldStreamWebcamPreview) {
				return;
			}

			try {
				let previewStream: MediaStream;
				try {
					previewStream = await navigator.mediaDevices.getUserMedia({
						video: buildPreviewVideoConstraints(webcamDeviceId),
						audio: false,
					});
				} catch (error) {
					// Preview resilience: one retry without exact device on missing/overconstrained cam.
					if (webcamDeviceId && isDeviceConstraintError(error)) {
						try {
							previewStream = await navigator.mediaDevices.getUserMedia({
								video: buildPreviewVideoConstraints(),
								audio: false,
							});
						} catch (retryError) {
							console.warn("Failed to start live webcam preview:", retryError);
							notifyUnavailable();
							return;
						}
					} else if (isNotAllowedError(error)) {
						console.warn("Failed to start live webcam preview:", error);
						notifyUnavailable();
						return;
					} else {
						console.warn("Failed to start live webcam preview:", error);
						notifyUnavailable();
						return;
					}
				}

				if (!mounted) {
					previewStream.getTracks().forEach((track) => track.stop());
					return;
				}

				previewStreamRef.current = previewStream;
				// Track settings are the authoritative aspect for the freshly negotiated
				// stream; element metadata can lag a device switch and distort the layout.
				const trackSettings = previewStream.getVideoTracks()[0]?.getSettings();
				if (
					trackSettings &&
					typeof trackSettings.width === "number" &&
					typeof trackSettings.height === "number" &&
					trackSettings.width > 0 &&
					trackSettings.height > 0
				) {
					const nextAspect = trackSettings.width / trackSettings.height;
					setVideoAspect((current) => (current === nextAspect ? current : nextAspect));
				}
				for (const node of previewVideoNodesRef.current) {
					attachPreviewStreamToNode(node);
				}
			} catch (error) {
				console.warn("Failed to start live webcam preview:", error);
				notifyUnavailable();
			}
		};

		void startPreview();

		return () => {
			mounted = false;
			const previewStream = previewStreamRef.current;

			for (const videoElement of previewVideoNodesRef.current) {
				videoElement.pause();
				videoElement.srcObject = null;
			}
			previewStream?.getTracks().forEach((track) => track.stop());
			if (previewStreamRef.current === previewStream) {
				previewStreamRef.current = null;
			}
		};
	}, [attachPreviewStreamToNode, shouldStreamWebcamPreview, webcamDeviceId]);

	useEffect(() => {
		return () => {
			for (const videoElement of previewVideoNodesRef.current) {
				detachVideoAspectListener(videoElement);
			}
			previewVideoNodesRef.current.clear();
			metadataListenerByNodeRef.current.clear();
		};
	}, [detachVideoAspectListener]);

	return {
		showFloatingWebcamPreview,
		setShowFloatingWebcamPreview,
		webcamPreviewAppearance,
		updateWebcamPreviewAppearance,
		webcamPreviewOffset,
		videoAspect,
		recordingWebcamPreviewContainerRef,
		isWebcamPreviewDraggingRef,
		webcamPreviewDragStartRef,
		handleWebcamPreviewPointerDown,
		handleWebcamPreviewPointerMove,
		handleWebcamPreviewPointerUp,
		setWebcamPreviewNode,
		setWebcamPreviewBackdropNode,
		setRecordingWebcamPreviewNode,
		setRecordingWebcamPreviewBackdropNode,
		showRecordingWebcamPreview,
	};
}
