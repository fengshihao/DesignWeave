"use client";

import { useMemo, useState } from "react";

export type DocNode = { path: string; name: string; isDir: boolean };

type TreeNode = DocNode & { children: TreeNode[] };

function toTree(files: DocNode[]): TreeNode[] {
  const byPath = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];
  for (const f of files) {
    byPath.set(f.path, { ...f, children: [] });
  }
  for (const f of files) {
    const node = byPath.get(f.path);
    if (!node) continue;
    const slash = f.path.lastIndexOf("/");
    const parent = slash === -1 ? "" : f.path.slice(0, slash);
    if (parent && byPath.has(parent)) {
      byPath.get(parent)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

function Branch(props: {
  nodes: TreeNode[];
  currentPath: string;
  onOpen: (path: string) => void;
}) {
  const [folded, setFolded] = useState<Record<string, boolean>>({});

  return (
    <ul className="tree-node">
      {props.nodes.map((node) => {
        const collapsed = folded[node.path] ?? node.path === "import";
        if (node.isDir) {
          return (
            <li key={node.path}>
              <button
                type="button"
                onClick={() =>
                  setFolded((prev) => ({ ...prev, [node.path]: !collapsed }))
                }
              >
                {collapsed ? "▸" : "▾"} {node.name}
              </button>
              {collapsed ? null : (
                <Branch
                  nodes={node.children}
                  currentPath={props.currentPath}
                  onOpen={props.onOpen}
                />
              )}
            </li>
          );
        }
        return (
          <li key={node.path}>
            <button
              type="button"
              className={node.path === props.currentPath ? "is-current" : ""}
              onClick={() => props.onOpen(node.path)}
            >
              {node.name}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function DocTree(props: {
  files: DocNode[];
  currentPath: string;
  onOpen: (path: string) => void;
  onImport: () => void;
}) {
  const tree = useMemo(() => toTree(props.files), [props.files]);
  return (
    <>
      <div className="file-tree">
        <Branch nodes={tree} currentPath={props.currentPath} onOpen={props.onOpen} />
      </div>
      <button className="btn ghost" type="button" style={{ marginTop: 12 }} onClick={props.onImport}>
        导入 Markdown
      </button>
    </>
  );
}
