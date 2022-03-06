import { Api } from "./Api";

type Page = {
  _id: string;
  type: "text" | "page";
  body: string;
  content: string[];
  parent: string;
}

export class PageApi extends Api {
  public async getById(id: string) {
    return this.get(`/api/pages/${id}`)
  }

  public async getAll() {
    return this.get("/api/pages")
  }

  public async create(params: { type: string; body?: string; parent?: string }) {
    return this.post<Page>("/api/pages", params)
  }

  public async update(id: string, params: { body: string; }) {
    return this.put<Page>(`/api/pages/${id}`, params)
  }

  public async removeById(id: string) {
    return this.delete(`/api/pages/${id}`);
  }
}

export const pageApi = new PageApi();