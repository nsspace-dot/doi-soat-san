// BẢNG QUY ĐỔI LÝ DO TRẢ — sửa tay được.
// Mỗi dòng: 'Tên chuẩn': ['các cách ghi khác', ...]. So khớp không phân biệt hoa/thường, dấu, dấu câu, khoảng trắng thừa.
// Tên chuẩn cũng tự khớp với chính nó. Lý do chưa có trong bảng sẽ giữ nguyên và hiện nhãn "chưa chuẩn hóa".
window.LYDO_MAP = {
  'Không đúng mô tả': ["Product doesn't match description", "Item doesn't match description", 'Not as described',
    'Sản phẩm không đúng mô tả', 'Không đúng mô tả', 'Hàng không giống mô tả', 'Sản phẩm không giống mô tả'],
  'Đổi ý / không còn nhu cầu': ['Change of mind', 'Changed my mind', 'I changed my mind', 'No longer needed', "Don't want it anymore",
    'Đổi ý', 'Không còn nhu cầu', 'Không muốn mua nữa'],
  'Hàng lỗi / hư hỏng': ['Damaged item', 'Item damaged', 'Product damaged', 'Damaged product', 'Defective item', 'Defective product',
    'Item is damaged', 'Sản phẩm bị hư hỏng', 'Hàng bị hư hỏng', 'Hàng lỗi', 'Hàng bị lỗi', 'Sản phẩm lỗi', 'Hư hỏng'],
  'Giao sai hàng': ['Wrong item', 'Received wrong item', 'Wrong product', 'Wrong item received', 'Giao sai hàng', 'Nhận sai sản phẩm', 'Giao nhầm hàng'],
  'Thiếu hàng / thiếu phụ kiện': ['Missing parts', 'Missing items', 'Item missing', 'Missing accessories', 'Package incomplete',
    'Thiếu hàng', 'Thiếu phụ kiện', 'Thiếu sản phẩm'],
  'Khách từ chối nhận': ['Customer refused delivery', 'Buyer refused delivery', 'Package rejected', 'Refused to accept',
    'Khách hàng đã từ chối nhận kiện hàng', 'Khách từ chối nhận hàng', 'Từ chối nhận hàng', 'Người mua từ chối nhận hàng'],
  'Không liên hệ được người nhận': ['Unable to contact buyer', 'Buyer unreachable', 'Customer unreachable', 'Cannot contact recipient',
    'Không liên hệ được người nhận', 'Không thể liên lạc với người mua', 'Không liên lạc được', 'Không liên hệ được khách'],
  'Sai / thiếu địa chỉ': ['Incorrect address', 'Wrong address', 'Incomplete address', 'Address issue', 'Sai địa chỉ', 'Địa chỉ không chính xác', 'Thiếu địa chỉ'],
  'Giao hàng thất bại': ['Delivery failed', 'Failed delivery', 'Package lost in transit', 'Giao hàng không thành công', 'Giao thất bại'],
  'Không nhận được hàng': ["Didn't receive the item", 'Item not received', 'Package not received', 'Không nhận được hàng'],
  'Hàng giả / hàng nhái': ['Counterfeit item', 'Fake item', 'Counterfeit', 'Hàng giả', 'Hàng nhái']
};
