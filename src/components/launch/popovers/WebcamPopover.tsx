import {
	Eye,
	EyeSlash as EyeOff,
	VideoCamera as Video,
	VideoCameraSlash as VideoOff,
} from "@phosphor-icons/react";
import { useScopedT } from "@/contexts/I18nContext";
import { DropdownItem, HudPopover } from "./PopoverScaffold";
import { useLaunchPopoverCoordinator } from "./LaunchPopoverCoordinator";
import type { DeviceOption } from "./launchPopoverTypes";
import type { ReactElement } from "react";
import type { WebcamPreviewAppearance } from "../webcamPreviewAppearance";

const POPOVER_ID = "webcam";

export function WebcamPopover({
	trigger,
	disabled,
	webcamEnabled,
	onDisableWebcam,
	canToggleFloatingPreview,
	showFloatingWebcamPreview,
	onToggleFloatingPreview,
	showWebcamControls,
	setWebcamPreviewNode,
	previewAppearance,
	onPreviewAppearanceChange,
	videoDevices,
	webcamDeviceId,
	selectedVideoDeviceId,
	onSelectVideoDevice,
}: {
	trigger: ReactElement;
	disabled?: boolean;
	webcamEnabled: boolean;
	onDisableWebcam: () => void;
	canToggleFloatingPreview: boolean;
	showFloatingWebcamPreview: boolean;
	onToggleFloatingPreview: () => void;
	showWebcamControls: boolean;
	setWebcamPreviewNode: (node: HTMLVideoElement | null) => void;
	previewAppearance: WebcamPreviewAppearance;
	onPreviewAppearanceChange: (patch: Partial<WebcamPreviewAppearance>) => void;
	videoDevices: DeviceOption[];
	webcamDeviceId?: string;
	selectedVideoDeviceId?: string;
	onSelectVideoDevice: (deviceId: string) => void;
}) {
	const t = useScopedT("launch");
	const { isOpen, requestOpen, requestClose } = useLaunchPopoverCoordinator();
	const open = isOpen(POPOVER_ID);

	return (
		<HudPopover
			open={open}
			onOpenChange={(nextOpen) => {
				if (!nextOpen) {
					requestClose(POPOVER_ID);
					return;
				}
				if (disabled) {
					return;
				}
				requestOpen(POPOVER_ID);
			}}
			trigger={trigger}
			align="center"
		>
			<div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--launch-label)]">
				{t("recording.webcam")}
			</div>
			{webcamEnabled && (
				<>
					<DropdownItem
						icon={<VideoOff size={16} />}
						onClick={() => {
							onDisableWebcam();
							requestClose(POPOVER_ID);
						}}
					>
						{t("recording.turnOffWebcam")}
					</DropdownItem>
					{canToggleFloatingPreview ? (
						<DropdownItem
							icon={
								showFloatingWebcamPreview ? <EyeOff size={16} /> : <Eye size={16} />
							}
							selected={showFloatingWebcamPreview}
							onClick={onToggleFloatingPreview}
						>
							{showFloatingWebcamPreview
								? t("recording.hideFloatingWebcamPreview")
								: t("recording.showFloatingWebcamPreview")}
						</DropdownItem>
					) : null}
				</>
			)}
			{!webcamEnabled && (
				<div className="px-3 py-2 text-xs text-[var(--launch-text-muted)]">
					{t("recording.selectWebcamToEnable")}
				</div>
			)}
			{showWebcamControls && (
				<div className="flex justify-center px-3 py-2">
					<div
						className="h-24 w-24 overflow-hidden bg-[var(--launch-hover)] ring-1 ring-[var(--launch-border-strong)]"
						style={{ borderRadius: `${previewAppearance.roundness / 2}%` }}
					>
						<video
							ref={setWebcamPreviewNode}
							className="h-full w-full object-cover"
							muted
							playsInline
							style={{
								transform: `scaleX(-1) scale(${previewAppearance.zoom})`,
							}}
						/>
					</div>
				</div>
			)}
			{webcamEnabled && (
				<div className="border-y border-[var(--launch-border)] px-3 py-2.5">
					<WebcamPreviewSlider
						label={t("recording.webcamPreviewSize", "Preview size")}
						valueLabel={`${previewAppearance.size}px`}
						min={144}
						max={320}
						step={8}
						value={previewAppearance.size}
						onChange={(size) => onPreviewAppearanceChange({ size })}
					/>
					<WebcamPreviewSlider
						label={t("recording.webcamPreviewRoundness", "Roundness")}
						valueLabel={`${previewAppearance.roundness}%`}
						min={0}
						max={100}
						step={5}
						value={previewAppearance.roundness}
						onChange={(roundness) => onPreviewAppearanceChange({ roundness })}
					/>
					<WebcamPreviewSlider
						label={t("recording.webcamPreviewZoom", "Framing zoom")}
						valueLabel={`${Math.round(previewAppearance.zoom * 100)}%`}
						min={100}
						max={150}
						step={5}
						value={Math.round(previewAppearance.zoom * 100)}
						onChange={(zoom) => onPreviewAppearanceChange({ zoom: zoom / 100 })}
					/>
				</div>
			)}
			{videoDevices.map((device) => (
				<DropdownItem
					key={device.deviceId}
					icon={
						webcamEnabled &&
						(webcamDeviceId === device.deviceId ||
							selectedVideoDeviceId === device.deviceId) ? (
							<Video size={16} />
						) : (
							<VideoOff size={16} />
						)
					}
					selected={
						webcamEnabled &&
						(webcamDeviceId === device.deviceId ||
							selectedVideoDeviceId === device.deviceId)
					}
					onClick={() => onSelectVideoDevice(device.deviceId)}
				>
					{device.label}
				</DropdownItem>
			))}
			{videoDevices.length === 0 && (
				<div className="text-center text-xs text-[var(--launch-text-muted)] py-4">
					{t("recording.noWebcamsFound")}
				</div>
			)}
		</HudPopover>
	);
}

function WebcamPreviewSlider({
	label,
	valueLabel,
	min,
	max,
	step,
	value,
	onChange,
}: {
	label: string;
	valueLabel: string;
	min: number;
	max: number;
	step: number;
	value: number;
	onChange: (value: number) => void;
}) {
	return (
		<label className="mb-2 block last:mb-0">
			<span className="mb-1 flex items-center justify-between gap-4 text-[11px] text-[var(--launch-text-muted)]">
				<span>{label}</span>
				<span className="tabular-nums text-[var(--launch-text)]">{valueLabel}</span>
			</span>
			<input
				type="range"
				className="block h-4 w-full cursor-pointer accent-[#2563eb]"
				min={min}
				max={max}
				step={step}
				value={value}
				onChange={(event) => onChange(Number(event.currentTarget.value))}
			/>
		</label>
	);
}
