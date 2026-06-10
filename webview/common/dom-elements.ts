type HtmlElementConstructor<T extends HTMLElement> = {
  new (): T;
  name: string;
};

function formatMissingMessage(selector: string): string {
  return `Missing required webview element "${selector}"`;
}

function formatMismatchMessage<T extends HTMLElement>(
  selector: string,
  expected: HtmlElementConstructor<T>
): string {
  return `Expected webview element "${selector}" to be ${expected.name}`;
}

function getOptionalElement<T extends HTMLElement>(
  element: Element | null,
  expected: HtmlElementConstructor<T>
): T | null {
  return element instanceof expected ? element : null;
}

function getRequiredElement<T extends HTMLElement>(
  element: Element | null,
  selector: string,
  expected: HtmlElementConstructor<T>
): T {
  if (!element) {
    throw new Error(formatMissingMessage(selector));
  }
  if (!(element instanceof expected)) {
    throw new Error(formatMismatchMessage(selector, expected));
  }
  return element;
}

export function getOptionalElementById<T extends HTMLElement>(
  root: ParentNode,
  id: string,
  expected: HtmlElementConstructor<T>
): T | null {
  return getOptionalElement(root.querySelector(`#${id}`), expected);
}

export function getRequiredElementById<T extends HTMLElement>(
  root: ParentNode,
  id: string,
  expected: HtmlElementConstructor<T>
): T {
  return getRequiredElement(root.querySelector(`#${id}`), `#${id}`, expected);
}

export function getOptionalElementBySelector<T extends HTMLElement>(
  root: ParentNode,
  selector: string,
  expected: HtmlElementConstructor<T>
): T | null {
  return getOptionalElement(root.querySelector(selector), expected);
}

export function getRequiredElementBySelector<T extends HTMLElement>(
  root: ParentNode,
  selector: string,
  expected: HtmlElementConstructor<T>
): T {
  return getRequiredElement(root.querySelector(selector), selector, expected);
}
