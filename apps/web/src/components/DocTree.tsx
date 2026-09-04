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

function FolderIcon(props: { open: boolean }) {
  return (
    <svg className="tree-folder-icon" viewBox="0 0 16 16" aria-hidden="true">
      {props.open ? (
        <>
          <path
            d="M1.8 4.4h4.1l1.3 1.6H14.2"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.45"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <path
            d="M1.8 6V12.4c0 .5.4.9.9.9h10.6c.5 0 .9-.4.9-.9l1.1-6.4H3.2z"
            fill="currentColor"
            fillOpacity="0.38"
            stroke="currentColor"
            strokeWidth="1.45"
            strokeLinejoin="round"
          />
        </>
      ) : (
        <path
          d="M1.8 4.6h4l1.25 1.55H14.2v7.25c0 .5-.4.9-.9.9H2.7c-.5 0-.9-.4-.9-.9z"
          fill="currentColor"
          fillOpacity="0.38"
          stroke="currentColor"
          strokeWidth="1.45"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}

function Branch(props: {
  nodes: TreeNode[];
  currentPath: string;
  onOpen: (path: string) => void;
  pendingFollow: Set<string>;
}) {
  const [folded, setFolded] = useState<Record<string, boolean>>({});

  return (
    <ul className="tree-node">
      {props.nodes.map((node) => {
        const isTopFolder = node.path === "product" || node.path === "eng" || node.path === "qa";
        const collapsed = folded[node.path] ?? (node.path === "import" || node.path.endsWith("/import"));
        if (node.isDir) {
          return (
            <li key={node.path}>
              <button
                type="button"
                className={`tree-folder${isTopFolder ? " is-root" : ""}`}
                aria-expanded={!collapsed}
                onClick={() =>
                  setFolded((prev) => ({ ...prev, [node.path]: !collapsed }))
                }
              >
                <FolderIcon open={!collapsed} />
                <span className="tree-folder-name">{node.name}</span>
                {isTopFolder && props.pendingFollow.has(node.path) ? (
                  <span className="follow-dot">待跟上</span>
                ) : null}
              </button>
              {collapsed ? null : (
                <Branch
                  nodes={node.children}
                  currentPath={props.currentPath}
                  onOpen={props.onOpen}
                  pendingFollow={props.pendingFollow}
                />
              )}
            </li>
          );
        }
        return (
          <li key={node.path}>
            <button
              type="button"
              className={`tree-file${node.path === props.currentPath ? " is-current" : ""}`}
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
  pendingFollow?: string[];
  onImport?: () => void;
}) {
  const tree = useMemo(() => toTree(props.files), [props.files]);
  const pending = new Set(props.pendingFollow || []);
  return (
    <>
      <div className="file-tree">
        <Branch
          nodes={tree}
          currentPath={props.currentPath}
          onOpen={props.onOpen}
          pendingFollow={pending}
        />
      </div>
      {props.onImport ? (
        <button className="btn ghost" type="button" style={{ marginTop: 12 }} onClick={props.onImport}>
          导入 Markdown
        </button>
      ) : null}
    </>
  );
}
