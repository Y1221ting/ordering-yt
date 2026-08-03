# 家庭点餐小程序（微信云开发）

一个给**自己家里用**的点餐微信小程序：家人拿起手机就能点菜，完全免费、无需支付、无需注册登录。

> 本项目基于开源项目 orderFood-wxCloud 二次开发，去除了支付、会员、桌码、打印等商业功能，定位为家庭内部点菜工具。感谢原作者的分享。

## ✨ 功能

### 👨‍👩‍👧 家人端
- **点餐**：分类浏览、搜索、菜品详情、规格（小份/大份等）、口味做法
- **口味与忌口**：结算时选择辣度（不辣/微辣/中辣/爆辣，可自定义选项）和忌口（葱姜蒜香菜等，可自定义），订单里会记住
- **购物车**：统一加入、统一提交
- **订单记录**：查看自己点过的菜和口味
- **家庭记账**：预算 + 花销记录 + 分类统计（独立功能，与点餐无关）

### 🛠️ 管理端（家庭管理员）
- **菜品管理**：增删改菜品（名称/图片/规格/分类/标签）
- **订单管理**：时间段筛选（今天/昨天/本周/本月/自定义）+ 流水/分类汇总双视图，一眼看清家里都点了啥
- **家庭设置**：店名、欢迎语、辣味选项、忌口选项
- **管理员密码**：防家人误入

> 💡 **进入管理后台**：在「我的」页右下角连点 5 次 → 输入管理员密码

### 🎨 主题
「青竹晚山」定制主题：墨青导航 + 米白底 + 竹绿点缀，清新雅致。

## 🛠️ 技术栈

- 微信小程序 + 微信云开发（云函数 + 云数据库）
- UI 组件：Vant Weapp + ColorUI

## 📁 项目结构

```
orderFood-wxCloud/
├── cloudfunctions/              # 云函数
│   ├── doBuy/                   # 下单（本项目唯一核心云函数，改代码后必须重新上传）
│   ├── login/                   # 用户登录
│   ├── getCategory/             # 获取菜品分类
│   └── ...（get_code/getPhoneNumber/getUserList/pay/pay_success/printBack/printManage
│            为旧项目云函数，与本项目共用云环境，保留不动）
│
├── miniprogram/                 # 小程序前端
│   ├── pages/
│   │   ├── index/               # 点餐首页
│   │   ├── dish-detail/         # 菜品详情
│   │   ├── settle/              # 结算确认（含辣味/忌口选择）
│   │   ├── myorder/             # 我的订单
│   │   ├── myhome/              # 个人中心
│   │   ├── expense/             # 家庭记账
│   │   └── admin/
│   │       ├── admin.js         # 管理后台首页
│   │       ├── dish/            # 菜品管理
│   │       ├── order/           # 订单管理（时间段+分类汇总）
│   │       └── shopSettings/    # 家庭设置
│   ├── utils/                   # 工具函数（购物车/菜品/店铺设置等）
│   ├── vant/                    # Vant Weapp 组件库
│   ├── components/              # 组件（colorui 样式库、头像昵称授权等）
│   ├── images/                  # 图片资源
│   └── app.js / app.json / app.wxss
│
└── project.config.json          # 项目配置
```

> 注：`recharge`（充值）、`admin/user`（会员）、`admin/rechargeOptions`、`admin/tableCode`、`admin/printer`、`admin/dishCategory` 等商业页面**已从 app.json 摘除注册，文件保留**，随时可恢复。

## 🚀 部署

### 环境要求

- 微信开发者工具（最新稳定版）
- 已注册的个人/企业微信小程序账号
- 已开通微信云开发

### 步骤

1. **导入项目**：微信开发者工具 → 导入项目 → 选择本目录 → 填入自己的 AppID

2. **配置云环境**：`miniprogram/app.js` 中把 `env` 换成自己的云环境 ID
   ```javascript
   wx.cloud.init({
     env: '你的云环境ID',
     traceUser: true,
   })
   ```

3. **创建数据库集合**：云开发控制台 → 数据库，创建以下集合：
   - `user`、`dish`、`dishCategory`、`order`、`admin`、`tableCode`、`printer`、`rechargeOptions`
   - 如使用家庭记账，再加 `expense`、`expense_budget`
   - 权限建议：所有集合「自定义安全规则」，`{ "read": true, "write": true }`（家庭内部使用）

4. **上传云函数**：在开发者工具中右键每个云函数文件夹 → **「上传并部署：云端安装依赖」**
   - 核心：`doBuy`（改动后必须重新上传才会生效）
   - 其余：`login`、`getCategory`、`get_code`、`getPhoneNumber`、`getUserList`、`pay`、`pay_success`、`printBack`、`printManage`

5. **运行**：点击「编译」即可在模拟器使用

### 进入管理后台

「我的」页 → 右下角连点 5 次 → 首次设置管理员密码（至少 6 位）→ 进入后台管理。

## ⚠️ 注意事项

- **云环境与旧项目共用**：不要删除任何旧云函数和旧集合（`pay_success`/`printManage` 等云端保留）
- **云函数改动必须重新上传**：改 `doBuy` 后记得右键「上传并部署：云端安装依赖」，否则线上还是旧版
- **旧数据兼容**：数据库中的旧价格/余额字段保留不动，仅不再展示

## 📄 相关文档

- [`家庭版简化整改方案.md`](家庭版简化整改方案.md) — 整改过程与进度记录
