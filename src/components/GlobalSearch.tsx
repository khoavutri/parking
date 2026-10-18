import { useEffect, useRef, useState } from 'react';
import { Input, Popover, Tag, Typography } from 'antd';
import { CarOutlined, IdcardOutlined, SearchOutlined, UserOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { db } from '../db/database';
import { normalizePlate, normalizeText } from '../utils/text';

interface SearchResults {
  sessions: Array<{ id: string; code: string; plate: string; status: string }>;
  customers: Array<{ id: string; name: string; phone: string; code: string }>;
  history: Array<{ id: string; code: string; plate: string; checkInAt: string }>;
}

/** Tìm nhanh toàn cục: biển số, số điện thoại, mã phiếu */
export function GlobalSearch() {
  const navigate = useNavigate();
  const [keyword, setKeyword] = useState('');
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<SearchResults>({ sessions: [], customers: [], history: [] });
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (timer.current) window.clearTimeout(timer.current);
    const kw = keyword.trim();
    if (kw.length < 2) return;
    timer.current = window.setTimeout(async () => {
      const plateNeedle = normalizePlate(kw);
      const textNeedle = normalizeText(kw);
      const allSessions = await db.sessions.toArray();
      const sessions = allSessions
        .filter((s) => s.status === 'IN' && (s.normalizedPlate.includes(plateNeedle) || normalizeText(s.code).includes(textNeedle)))
        .slice(0, 4);
      const customers = (await db.customers.toArray())
        .filter((c) => c.searchName.includes(textNeedle) || c.normalizedPhone.includes(textNeedle))
        .slice(0, 4);
      const history = allSessions
        .filter((s) => s.status === 'OUT' && s.normalizedPlate.includes(plateNeedle))
        .sort((a, b) => (a.checkInAt < b.checkInAt ? 1 : -1))
        .slice(0, 3);
      setResults({ sessions, customers, history });
      setOpen(true);
    }, 220);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [keyword]);

  const hasResults = results.sessions.length + results.customers.length + results.history.length > 0;

  const content = (
    <div style={{ width: 380, maxHeight: 420, overflowY: 'auto' }}>
      {!hasResults ? (
        <Typography.Text type="secondary">Không tìm thấy kết quả phù hợp.</Typography.Text>
      ) : (
        <div>
          {results.sessions.map((s) => (
            <div
              key={`s-${s.id}`}
              style={{ cursor: 'pointer', padding: '6px 4px', borderBottom: '1px dashed #edf1f6' }}
              onClick={() => {
                setOpen(false);
                setKeyword('');
                navigate(`/sessions?q=${encodeURIComponent(s.plate)}`);
              }}
            >
              <Tag icon={<CarOutlined />} color="cyan">
                Trong bãi
              </Tag>
              <span className="text-strong" style={{ marginInlineEnd: 8 }}>
                {s.plate}
              </span>
              <span className="text-muted">{s.code}</span>
            </div>
          ))}
          {results.customers.map((c) => (
            <div
              key={`c-${c.id}`}
              style={{ cursor: 'pointer', padding: '6px 4px', borderBottom: '1px dashed #edf1f6' }}
              onClick={() => {
                setOpen(false);
                setKeyword('');
                navigate(`/customers?q=${encodeURIComponent(c.name)}`);
              }}
            >
              <Tag icon={<UserOutlined />} color="geekblue">
                Khách
              </Tag>
              <span className="text-strong" style={{ marginInlineEnd: 8 }}>
                {c.name}
              </span>
              <span className="text-muted">{c.phone}</span>
            </div>
          ))}
          {results.history.map((s) => (
            <div
              key={`h-${s.id}`}
              style={{ cursor: 'pointer', padding: '6px 4px', borderBottom: '1px dashed #edf1f6' }}
              onClick={() => {
                setOpen(false);
                setKeyword('');
                navigate(`/sessions?tab=history&q=${encodeURIComponent(s.plate)}`);
              }}
            >
              <Tag icon={<IdcardOutlined />} color="purple">
                Lịch sử
              </Tag>
              <span className="text-strong" style={{ marginInlineEnd: 8 }}>
                {s.plate}
              </span>
              <span className="text-muted">{s.code}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <Popover
      open={open && keyword.trim().length >= 2}
      onOpenChange={(next) => {
        if (!next) setOpen(false);
      }}
      content={content}
      placement="bottomLeft"
      trigger="click"
      styles={{ content: { padding: 8 } }}
    >
      <Input
        allowClear
        prefix={<SearchOutlined />}
        placeholder="Tìm biển số, số điện thoại, mã phiếu..."
        style={{ width: 320 }}
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
      />
    </Popover>
  );
}
