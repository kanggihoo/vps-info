import { FormEvent, useEffect, useState } from "react";
import { BrowserRouter, Link, Route, Routes, useParams } from "react-router-dom";

import { ItemDetail, ItemSummary, JobRun, loadItem, loadItems, loadJobRun, loadJobRuns } from "./api";

function ErrorNotice({ error, retry }: { error: string; retry: () => void }) {
  return <p role="alert">{error} <button onClick={retry}>다시 시도</button></p>;
}

function ListPage() {
  const [source, setSource] = useState("");
  const [items, setItems] = useState<ItemSummary[]>([]);
  const [error, setError] = useState("");
  const load = () => loadItems({ source: source || undefined, limit: 20, offset: 0 })
    .then(({ items: result }) => { setItems(result); setError(""); })
    .catch((cause: Error) => setError(cause.message));
  useEffect(() => { load(); }, []);
  const submit = (event: FormEvent) => { event.preventDefault(); load(); };
  return <section><h1>항목</h1><form onSubmit={submit}>
    <label>Source <input value={source} onChange={(event) => setSource(event.target.value)} /></label>
    <button>필터</button>
  </form>{error ? <ErrorNotice error={error} retry={load} /> : <ul>{items.map((item) => <li key={item.id}><Link to={`/items/${item.id}`}>{item.title}</Link> <small>{item.source}</small></li>)}</ul>}</section>;
}

function ItemPage() {
  const { id } = useParams();
  const [item, setItem] = useState<ItemDetail>();
  const [error, setError] = useState("");
  const load = () => id && loadItem(Number(id)).then(setItem).catch((cause: Error) => setError(cause.message));
  useEffect(() => { load(); }, [id]);
  if (error) return <ErrorNotice error={error} retry={load} />;
  if (!item) return <p>불러오는 중…</p>;
  return <article><h1>{item.title}</h1><p>{item.summary}</p><a href={item.url}>원문</a>{item.sourceItemUrl && <a href={item.sourceItemUrl}>출처</a>}</article>;
}

function RunsPage() {
  const [runs, setRuns] = useState<JobRun[]>([]);
  const [error, setError] = useState("");
  const load = () => loadJobRuns().then((result) => { setRuns(result); setError(""); }).catch((cause: Error) => setError(cause.message));
  useEffect(() => { load(); }, []);
  return <section><h1>수집 이력</h1>{error ? <ErrorNotice error={error} retry={load} /> : <ul>{runs.map((run) => <li key={run.id}><Link to={`/runs/${run.id}`}>{run.jobKey}</Link> {run.status}</li>)}</ul>}</section>;
}

export function RunDetailPage({ run }: { run: JobRun }) {
  return <section><h1>{run.jobKey}</h1><strong>{run.status}</strong><ul>{run.children?.map((child) => <li key={child.id}><span>{child.jobKey}</span> <strong>{child.status}</strong> {child.errorMessage}</li>)}</ul></section>;
}

function RunPage() {
  const { id } = useParams();
  const [run, setRun] = useState<JobRun>();
  const [error, setError] = useState("");
  const load = () => id && loadJobRun(Number(id)).then(setRun).catch((cause: Error) => setError(cause.message));
  useEffect(() => { load(); }, [id]);
  if (error) return <ErrorNotice error={error} retry={load} />;
  return run ? <RunDetailPage run={run} /> : <p>불러오는 중…</p>;
}

export default function App() {
  return <BrowserRouter><nav><Link to="/">항목</Link> <Link to="/runs">실행 이력</Link></nav><main><Routes>
    <Route path="/" element={<ListPage />} /><Route path="/items/:id" element={<ItemPage />} />
    <Route path="/runs" element={<RunsPage />} /><Route path="/runs/:id" element={<RunPage />} />
  </Routes></main></BrowserRouter>;
}
