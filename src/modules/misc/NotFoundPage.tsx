import { Result, Button } from 'antd';
import { useNavigate } from 'react-router-dom';

export function NotFoundPage({ path }: { path?: string }) {
  const navigate = useNavigate();
  return (
    <Result
      status="404"
      title="Không tìm thấy trang"
      subTitle={path ? `Đường dẫn "${path}" không tồn tại trong ParkOne.` : 'Đường dẫn không tồn tại trong ParkOne.'}
      extra={
        <Button type="primary" onClick={() => navigate('/dashboard')}>
          Về trang tổng quan
        </Button>
      }
    />
  );
}
