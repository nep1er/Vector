import { useRef, useState } from 'react';
import { api } from '../../api';
import type { PackageReport } from '../../types';
import { PERMISSION_INFO, fmtSize } from '../../utils/extensions';
import Modal from '../Modal';

/** Загрузка .zip: сначала проверка на сервере (dry-run) с отчётом, потом публикация на модерацию. */
export default function UploadModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [report, setReport] = useState<PackageReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const pick = async (f: File | null) => {
    setFile(f);
    setReport(null);
    setError('');
    if (!f) return;
    setBusy(true);
    try {
      setReport(await api.extensions.validate(f));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const publish = async () => {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const r = await api.extensions.upload(file);
      if (!r.ok) setReport(r);
      else {
        setDone(true);
        onDone();
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const m = report?.manifest;
  return (
    <Modal title="Загрузить расширение" onClose={onClose} wide>
      {done ? (
        <>
          <div className="notice">Готово! Версия отправлена на проверку модератору. Статус виден во вкладке «Мои разработки», о решении придёт уведомление.</div>
          <div className="modal-actions"><button className="btn btn-primary" onClick={onClose}>Закрыть</button></div>
        </>
      ) : (
        <>
          <p className="muted">Архив .zip с <code>manifest.json</code> в корне. Сервер проверяет структуру, типы файлов, размеры и опасные конструкции (внешние ресурсы, inline-скрипты, формы и т. п.). Требования — в документации для разработчиков (<code>docs/extensions.md</code>).</p>
          <input ref={input} type="file" accept=".zip,application/zip" hidden onChange={(e) => pick(e.target.files?.[0] ?? null)} />
          <button className="btn btn-secondary" disabled={busy} onClick={() => input.current?.click()}>{file ? `${file.name} (${fmtSize(file.size)})` : 'Выбрать .zip'}</button>
          {busy && <p className="muted">Проверяем…</p>}
          {error && <div className="notice notice-err">{error}</div>}

          {report && (
            <div className="ext-validation">
              {report.errors.length > 0 && (
                <div className="notice notice-err">
                  <b>Пакет не прошёл проверку:</b>
                  <ul>{report.errors.map((x, i) => <li key={i}>{x}</li>)}</ul>
                </div>
              )}
              {report.warnings.length > 0 && (
                <div className="notice">
                  <b>Предупреждения</b> (не блокируют, но модератор их увидит):
                  <ul>{report.warnings.map((x, i) => <li key={i}>{x}</li>)}</ul>
                </div>
              )}
              {m && (
                <div className="ext-manifest">
                  <b>{m.name}</b> <span className="muted">v{m.version} · id {m.id}</span>
                  <p>{m.description}</p>
                  <p className="muted">Права: {m.permissions.length ? m.permissions.map((p) => PERMISSION_INFO[p]?.label ?? p).join(', ') : 'нет'} · Файлов: {report.files.length} · {fmtSize(report.size)}</p>
                </div>
              )}
            </div>
          )}
          <div className="modal-actions">
            <button className="btn btn-quiet" onClick={onClose}>Отмена</button>
            <button className="btn btn-primary" disabled={busy || !report?.ok} onClick={publish}>Отправить на проверку</button>
          </div>
        </>
      )}
    </Modal>
  );
}
