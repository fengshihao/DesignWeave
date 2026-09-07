/** 工作台资源双挂：正名 /v1/projects，过渡别名 /v1/requirements */
export const PROJECT_API_BASES = ["/v1/projects", "/v1/requirements"] as const;

export type ProjectApiBase = (typeof PROJECT_API_BASES)[number];
