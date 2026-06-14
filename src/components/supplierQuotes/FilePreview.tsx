import React, { useEffect, useState } from 'react';
import { Loader2, FileText, Download } from 'lucide-react';

interface Props {
  pathname: string;
  fileName: string;
  mimeType: string;
  onClose: () => void;
}

export default function FilePreview({ pathname, fileName, mimeType, onClose }: Props) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [excelRows, setExcelRows] = useState<unknown[][] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const isImage = mimeType.startsWith('image/');
  const isPdf = mimeType === 'application/pdf';
  const isExcel = mimeType.includes('spreadsheet') || mimeType.includes('ms-excel') || fileName.endsWith('.xlsx') || fileName.endsWith('.xls');

  useEffect(() => {
    let cancelled = false;
    const url = `/api/quotation/file?pathname=${encodeURIComponent(pathname)}`;

    if (isExcel) {
      fetch(url, { cache: 'no-store' })
        .then(async res => {
          if (!res.ok) throw new Error('无法加载文件');
          const XLSX = await import('xlsx');
          const wb = XLSX.read(await res.arrayBuffer(), { type: 'array' });
          const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], {
            header: 1, raw: false, blankrows: false,
          }).slice(0, 500);
          if (!cancelled) { setExcelRows(rows); setLoading(false); }
        })
        .catch(err => { if (!cancelled) { setError(err.message); setLoading(false); } });
    } else {
      fetch(url, { cache: 'no-store' })
        .then(async res => {
          if (!res.ok) throw new Error('无法加载文件');
          const blob = await res.blob();
          if (!cancelled) { setBlobUrl(URL.createObjectURL(blob)); setLoading(false); }
        })
        .catch(err => { if (!cancelled) { setError(err.message); setLoading(false); } });
    }

    return () => {
      cancelled = true;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [pathname]);

  const columnCount = excelRows ? Math.min(30, excelRows.reduce((max, row) => Math.max(max, row.length), 0)) : 0;

  return (
    <div className="flex h-full flex-col bg-white">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <FileText className="h-4 w-4 shrink-0 text-slate-500" />
          <span className="truncate text-xs font-semibold text-slate-700">{fileName}</span>
        </div>
        <div className="flex items-center gap-2">
          <a href={`/api/quotation/file?pathname=${encodeURIComponent(pathname)}`} download={fileName} className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-50">
            <Download className="h-3 w-3" /> 下载
          </a>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <span className="text-xs">关闭</span>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto bg-slate-100 p-4">
        {loading && (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
          </div>
        )}
        {error && (
          <div className="flex h-full items-center justify-center text-sm text-red-500">{error}</div>
        )}

        {!loading && !error && isImage && blobUrl && (
          <div className="flex h-full items-center justify-center">
            <img src={blobUrl} alt={fileName} className="max-h-full max-w-full object-contain shadow-lg" />
          </div>
        )}

        {!loading && !error && isPdf && blobUrl && (
          <iframe src={blobUrl} className="h-full w-full rounded-lg border border-slate-200 bg-white" title={fileName} />
        )}

        {!loading && !error && isExcel && excelRows && (
          <div className="overflow-auto rounded-lg border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full border-collapse text-[11px]">
              <tbody>
                {excelRows.map((row, ri) => (
                  <tr key={ri}>
                    {Array.from({ length: columnCount }, (_, ci) => (
                      <td key={ci} className={`max-w-60 whitespace-pre-wrap border border-slate-200 px-2.5 py-2 align-top ${ri === 0 ? 'bg-slate-100 font-bold' : ''}`}>
                        {String(row[ci] ?? '')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && !error && !isImage && !isPdf && !isExcel && blobUrl && (
          <div className="flex h-full flex-col items-center justify-center gap-4">
            <FileText className="h-16 w-16 text-slate-300" />
            <p className="text-sm text-slate-500">此文件类型暂不支持在线预览</p>
            <a href={blobUrl} download={fileName} className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700">
              <Download className="h-4 w-4" /> 下载文件
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
