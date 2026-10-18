import { Empty } from 'antd';
import type { ReactNode } from 'react';

export function EmptyState({ description, action }: { description: ReactNode; action?: ReactNode }) {
  return (
    <div style={{ padding: '32px 16px', textAlign: 'center' }}>
      <Empty image={undefined} imageStyle={{ display: 'none' }} description={<span style={{ color: '#6b7a8d' }}>{description}</span>}>
        {action}
      </Empty>
    </div>
  );
}
