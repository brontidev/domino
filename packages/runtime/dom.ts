export function child(node: Node, index: number) {
  let i = -1;
  for (const child of node.childNodes) {
    if (child.nodeType === 3 && !child.textContent?.trim()) continue;
    i++;
    if (i === index) return child as Node;
  }
}

export function tree(node: Node, ...indexes: number[]) {
  let cur = node;
  for (const index of indexes) {
    cur = child(cur, index)!;
  }
  return cur;
}

export function $if<T>(
  anchor: HTMLElement,
  template: HTMLTemplateElement,
  pieces: (node: Node) => T,
): ((show: boolean) => boolean) & { pieces?: T } {
  let nodes: ChildNode[] | undefined;
  
  const fn = ((show: boolean) => {
    if (show && !nodes) {
      const root = template.content.cloneNode(true);
      Object.assign(fn, { pieces: pieces(root) });
      nodes = [...root.childNodes];
      anchor.after(...nodes);
    } else if (!show && nodes) {
      nodes.forEach((n) => n.remove());
      Object.assign(fn, { pieces: undefined });
      nodes = undefined;
    }
  }) as unknown as ((show: boolean) => boolean) & { pieces?: T };

  return fn;
}
