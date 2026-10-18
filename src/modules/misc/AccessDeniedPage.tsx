import { Result, Button } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useRole } from '../../app/RoleContext';
import { ROLE_LABEL } from '../../utils/status';
import { DEFAULT_PAGE_BY_ROLE } from '../../services/permissions';

export function AccessDeniedPage() {
  const { role } = useRole();
  const navigate = useNavigate();
  return (
    <Result
      status="403"
      title="Không có quyền truy cập"
      subTitle={`Vai trò hiện tại (${ROLE_LABEL[role]}) không được phép mở trang này. Chuyển vai trò phù hợp ở góc phải trên nếu cần.`}
      extra={
        <Button type="primary" onClick={() => navigate(DEFAULT_PAGE_BY_ROLE[role])}>
          Về trang mặc định của vai trò
        </Button>
      }
    />
  );
}
