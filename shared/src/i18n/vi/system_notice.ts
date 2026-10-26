import type { TranslationStrings } from '../types';

const system_notice: TranslationStrings = {
  'system_notice.v3_photos.title': 'Ảnh đã chuyển sang 3.0',
  'system_notice.v3_photos.body':
    '**Ảnh** trong Công cụ lập kế hoạch chuyến đi đã bị xóa. Ảnh của bạn được an toàn — TREK chưa bao giờ sửa đổi thư viện Immich hoặc Synology của bạn.\n\nẢnh hiện có trong tiện ích bổ sung **Journey**. Hành trình là tùy chọn — nếu nó chưa có sẵn, hãy yêu cầu quản trị viên của bạn kích hoạt nó trong Quản trị → Tiện ích bổ sung.',
  'system_notice.v3_journey.title': 'Hành Trình Gặp Gỡ - tạp chí du lịch',
  'system_notice.v3_journey.body':
    'Ghi lại chuyến đi của bạn dưới dạng những câu chuyện du lịch phong phú với dòng thời gian, thư viện ảnh và bản đồ tương tác.',
  'system_notice.v3_journey.cta_label': 'Hành trình mở',
  'system_notice.v3_journey.highlight_timeline': 'Dòng thời gian và thư viện hàng ngày',
  'system_notice.v3_journey.highlight_photos': 'Nhập từ Immich hoặc Synology',
  'system_notice.v3_journey.highlight_share': 'Chia sẻ công khai - không cần đăng nhập',
  'system_notice.v3_journey.highlight_export': 'Xuất dưới dạng sách ảnh PDF',
  'system_notice.v3_features.title': 'Nhiều điểm nổi bật hơn trong 3.0',
  'system_notice.v3_features.body': 'Một vài điều đáng biết nữa về phiên bản này.',
  'system_notice.v3_features.highlight_dashboard': 'Thiết kế lại bảng điều khiển ưu tiên thiết bị di động',
  'system_notice.v3_features.highlight_offline': 'Chế độ ngoại tuyến hoàn toàn dưới dạng PWA',
  'system_notice.v3_features.highlight_search': 'Tự động hoàn thành tìm kiếm địa điểm theo thời gian thực',
  'system_notice.v3_features.highlight_import': 'Nhập địa điểm từ tệp KMZ/KML',
  'system_notice.v3_mcp.title': 'MCP: OAuth nâng cấp 2.1',
  'system_notice.v3_mcp.body':
    'Tích hợp MCP đã được đại tu hoàn toàn. OAuth 2.1 hiện là phương pháp xác thực được đề xuất. Mã thông báo tĩnh cũ (trek_…) không được dùng nữa và sẽ bị xóa trong bản phát hành trong tương lai.',
  'system_notice.v3_mcp.highlight_oauth': 'OAuth Khuyến nghị 2.1 (mcp-remote)',
  'system_notice.v3_mcp.highlight_scopes': '24 phạm vi cấp phép chi tiết',
  'system_notice.v3_mcp.highlight_deprecated': 'Mã thông báo trek_ tĩnh không được dùng nữa',
  'system_notice.v3_mcp.highlight_tools': 'Bộ công cụ và lời nhắc mở rộng',
  'system_notice.v3014_whitespace_collision.title': 'Hành động bắt buộc: xung đột tài khoản người dùng',
  'system_notice.v3014_whitespace_collision.body':
    'Bản nâng cấp 3.0.14 đã phát hiện một hoặc nhiều xung đột tên người dùng hoặc email do khoảng trắng ở đầu/cuối trong tài khoản được lưu trữ. Các tài khoản bị ảnh hưởng đã được đổi tên tự động. Kiểm tra nhật ký máy chủ để tìm các dòng bắt đầu bằng **[migration] WHITESPACE COLLISION** để xác định tài khoản nào cần xem xét.',
  'system_notice.welcome_v1.title': 'Chào mừng đến với TREK',
  'system_notice.welcome_v1.body':
    'Công cụ lập kế hoạch du lịch tất cả trong một của bạn. Xây dựng hành trình, chia sẻ chuyến đi với bạn bè và luôn ngăn nắp — trực tuyến hoặc ngoại tuyến.',
  'system_notice.welcome_v1.cta_label': 'Lên kế hoạch cho một chuyến đi',
  'system_notice.welcome_v1.hero_alt': 'Một điểm đến du lịch tuyệt đẹp với lớp phủ TREK quy hoạch UI',
  'system_notice.welcome_v1.highlight_plan': 'Lịch trình hàng ngày cho bất kỳ chuyến đi nào',
  'system_notice.welcome_v1.highlight_share': 'Hợp tác với các đối tác du lịch',
  'system_notice.welcome_v1.highlight_offline': 'Hoạt động ngoại tuyến trên thiết bị di động',
  'system_notice.dev_test_modal.title': '[Dev] Thông báo kiểm tra',
  'system_notice.dev_test_modal.body': 'Đây là thông báo kiểm tra chỉ dành cho nhà phát triển.',
  // Thank-you + support the project (shown once per install and once per upgrade)
  'system_notice.pager.prev': 'Thông báo trước',
  'system_notice.pager.next': 'Thông báo tiếp theo',
  'system_notice.pager.counter': '{current} / {total}',
  'system_notice.pager.goto': 'Vào thông báo {n}',
  'system_notice.pager.position': 'Thông báo {current} của {total}',
  // The release modal. One stable set of keys: each big release swaps the copy in place.
};
export default system_notice;
