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
    cur = child(cur, index)!
  }
  return cur
}