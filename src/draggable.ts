import Vue, { DirectiveOptions, VNodeDirective, VNode } from "vue";

export type HandleType = Vue | HTMLElement;
export interface Position {
	left: number;
	top: number;
}

export interface PositionDiff {
	x: number;
	y: number;
}

export interface MarginOptions {
	top?: number;
	right?: number;
	bottom?: number;
	left?: number;
}

export interface DraggableValue {
	handle?: HandleType;
	onPositionChange?: (posDiff?: PositionDiff, pos?: Position, event?: MouseEvent) => void;
	onDragEnd?: (posDiff?: PositionDiff, pos?: Position, event?: MouseEvent) => void;
	onDragStart?: (posDiff?: PositionDiff, pos?: Position, event?: MouseEvent) => void;
	resetInitialPos?: boolean;
	stopDragging?: boolean;
	boundingRect?: ClientRect;
	boundingElement?: HTMLElement;
	boundingRectMargin?: MarginOptions;
	initialPosition?: Position;
	cssPosition?: string;
}

export interface DraggableBindings extends VNodeDirective {
	value: DraggableValue;
}

export interface DraggableState {
	initialPosition: Position;
	startDragPosition: Position;
	currentDragPosition: Position;
	initialMousePos?: Position;
}

enum ChangePositionType {
	Start = 1,
	End,
	Move
}

function extractHandle(handle: HandleType): HTMLElement {
	return handle && (handle as Vue).$el || handle as HTMLElement;
}

function getPosWithBoundaries(elementRect: ClientRect, boundingRect: ClientRect, left: number, top: number, boundingRectMargin: MarginOptions = {}): Position {
	const adjustedPos: Position = { left, top };
	const { height, width } = elementRect;
	const topRect = top,
		bottomRect = top + height,
		leftRect = left,
		rightRect = left + width;
	const marginTop = boundingRectMargin.top || 0,
		marginBottom = boundingRectMargin.bottom || 0,
		marginLeft = boundingRectMargin.left || 0,
		marginRight = boundingRectMargin.right || 0;
	const topBoundary = boundingRect.top + marginTop,
		bottomBoundary = boundingRect.bottom - marginBottom,
		leftBoundary = boundingRect.left + marginLeft,
		rightBoundary = boundingRect.right - marginRight;
	if (topRect < topBoundary) {
		adjustedPos.top = topBoundary;
	}
	else if (bottomRect > bottomBoundary) {
		adjustedPos.top = bottomBoundary - height;
	}
	if (leftRect < leftBoundary) {
		adjustedPos.left = leftBoundary;
	}
	else if (rightRect > rightBoundary) {
		adjustedPos.left = rightBoundary - width;
	}
	return adjustedPos;
}

export const Draggable: DirectiveOptions = {
	bind(el: HTMLElement, binding: DraggableBindings, vnode: VNode, oldVnode: VNode) {
		Draggable.update(el, binding, vnode, oldVnode);
	},
	update(el: HTMLElement, binding: DraggableBindings, vnode: VNode, oldVnode: VNode) {
		if (binding.value && binding.value.stopDragging) {
			return;
		}
		const handler = (binding.value && binding.value.handle && extractHandle(binding.value.handle)) || el;
		if (binding && binding.value && binding.value.resetInitialPos) {
			initializeState();
			handlePositionChanged();
		}
		if (!handler.getAttribute("draggable")) {
			el.removeEventListener("mousedown", (el as any)["listener"]);
			handler.addEventListener("mousedown", mouseDown);
			handler.setAttribute("draggable", "true");
			(el as any)["listener"] = mouseDown;
			initializeState();
			handlePositionChanged();
		}

		function mouseMove(event: MouseEvent) {
			event.preventDefault();

			const stopDragging = binding.value && binding.value.stopDragging;
			if (stopDragging) {
				return;
			}

			let state = getState();
			if (!state.startDragPosition || !state.initialMousePos) {
				initializeState(event);
				state = getState();
			}

			let dx = event.clientX - state.initialMousePos.left;
			let dy = event.clientY - state.initialMousePos.top;

			let currentDragPosition = {
				left: state.startDragPosition.left + dx,
				top: state.startDragPosition.top + dy
			};

			const boundingRect = getBoundingRect();
			const elementRect = el.getBoundingClientRect();

			if (boundingRect && elementRect) {
				currentDragPosition = getPosWithBoundaries(
					elementRect,
					boundingRect,
					currentDragPosition.left,
					currentDragPosition.top,
					binding.value.boundingRectMargin
				);
			}

			setState({ currentDragPosition });
			updateElementStyle();
			handlePositionChanged(event);
		}

		function getBoundingRect(): ClientRect | undefined {
			if (!binding.value) {
				return;
			}

			return binding.value.boundingRect
				|| binding.value.boundingElement
				&& binding.value.boundingElement.getBoundingClientRect();
		}

		function updateElementStyle(): void {
			const state = getState();
			if (!state.currentDragPosition) {
				return;
			}

			el.style.position = binding.value.cssPosition || "fixed";
			el.style.left = `${state.currentDragPosition.left}px`;
			el.style.top = `${state.currentDragPosition.top}px`;
		}

		function mouseUp(event: MouseEvent) {
			event.preventDefault();

			const currentRectPosition = getRectPosition();
			setState({
				initialMousePos: undefined,
				startDragPosition: currentRectPosition,
				currentDragPosition: currentRectPosition
			});

			document.removeEventListener("mousemove", mouseMove);
			document.removeEventListener("mouseup", mouseUp);
			handlePositionChanged(event, ChangePositionType.End);
		}

		function mouseDown(event: MouseEvent) {
			setState({ initialMousePos: getInitialMousePosition(event) });
			handlePositionChanged(event, ChangePositionType.Start);
			document.addEventListener("mousemove", mouseMove);
			document.addEventListener("mouseup", mouseUp);
		}

		function getInitialMousePosition(event?: MouseEvent): Position | undefined {
			return event && {
				left: event.clientX,
				top: event.clientY
			};
		}

		function getRectPosition(): Position | undefined {
			const clientRect = el.getBoundingClientRect();
			if (!clientRect.height || !clientRect.width) {
				return;
			}
			return { left: clientRect.left, top: clientRect.top };
		}

		function initializeState(event?: MouseEvent): void {
			const state = getState();
			const initialRectPositionFromBinding = binding && binding.value && binding.value.initialPosition;
			const initialRectPositionFromState = state.initialPosition;
			const startingDragPosition = getRectPosition();
			const initialPosition = initialRectPositionFromBinding || initialRectPositionFromState || startingDragPosition;

			setState({
				initialPosition: initialPosition,
				startDragPosition: initialPosition,
				currentDragPosition: initialPosition,
				initialMousePos: getInitialMousePosition(event)
			});
			updateElementStyle();
		}

		function setState(partialState: Partial<DraggableState>) {
			const prevState = getState();
			const state = {
				...prevState,
				...partialState
			};
			handler.setAttribute("draggable-state", JSON.stringify(state));
		}

		function handlePositionChanged(event?: MouseEvent, changePositionType?: ChangePositionType) {

			const state = getState();
			const posDiff: PositionDiff = { x: 0, y: 0 };
			if (state.currentDragPosition && state.startDragPosition) {
				posDiff.x = state.currentDragPosition.left - state.startDragPosition.left;
				posDiff.y = state.currentDragPosition.top - state.startDragPosition.top;
			}
			const currentPosition = state.currentDragPosition && { ...state.currentDragPosition };

			if (changePositionType === ChangePositionType.End) {
				binding.value && binding.value.onDragEnd && state && binding.value.onDragEnd(posDiff, currentPosition, event);
			}
			else if (changePositionType === ChangePositionType.Start) {
				binding.value && binding.value.onDragStart && state && binding.value.onDragStart(posDiff, currentPosition, event);
			}
			else {
				binding.value && binding.value.onPositionChange && state && binding.value.onPositionChange(posDiff, currentPosition, event);
			}
		}

		function getState(): DraggableState {
			return JSON.parse(handler.getAttribute("draggable-state") as string) || {};
		}
	}
};