// 云函数：monthlyRollover —— 记账月度自动结转
// 定时触发：每月 1 日 0:30（北京时间）自动把上月预算复制到本月（本月未设置时）
// 也支持手动触发测试：event 可传 { year, month } 指定目标月
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// 北京时间当前年月（offsetMonths: 0=本月, 1=上月；云函数服务器是 UTC，需手动 +8）
function getBeijingMonth(offsetMonths = 0) {
  const now = new Date(Date.now() + 8 * 3600 * 1000)
  let year = now.getUTCFullYear()
  let month = now.getUTCMonth() + 1 - offsetMonths
  if (month <= 0) {
    month += 12
    year -= 1
  }
  const pad = n => (n < 10 ? '0' + n : '' + n)
  return { year, month: pad(month), key: year + '-' + pad(month) }
}

exports.main = async (event = {}) => {
  try {
    // 目标月：手动触发可指定（测试用），否则取当前月
    let target
    if (event && event.year && event.month) {
      target = {
        year: Number(event.year),
        month: String(event.month).padStart(2, '0')
      }
    } else {
      target = getBeijingMonth(0)
    }
    const month = target.year + '-' + target.month

    // 上月
    const last = getBeijingMonth(1)
    const lastMonth = last.key

    // 1. 读上月预算
    const lastRes = await db.collection('expense_budget').where({ month: lastMonth }).limit(1).get()
    if (lastRes.data.length === 0) {
      return {
        success: true,
        message: '上月（' + lastMonth + '）没有预算，无需结转',
        month,
        lastMonth
      }
    }
    const lastBudget = Number(lastRes.data[0].budget)

    // 2. 本月是否已有预算（有则不覆盖，尊重手动设置）
    const curRes = await db.collection('expense_budget').where({ month }).limit(1).get()
    if (curRes.data.length > 0) {
      return {
        success: true,
        message: '本月已设置预算（¥' + curRes.data[0].budget + '），不覆盖',
        month,
        lastMonth,
        lastBudget
      }
    }

    // 3. 写入本月预算（沿用上月值）
    await db.collection('expense_budget').add({
      data: {
        month,
        budget: lastBudget,
        createTime: db.serverDate()
      }
    })

    return {
      success: true,
      message: '已结转：上月 ¥' + lastBudget + ' → 本月',
      month,
      lastMonth,
      budget: lastBudget
    }
  } catch (err) {
    console.error('月度结转失败', err)
    return {
      success: false,
      message: '结转失败：' + (err.message || '未知错误')
    }
  }
}
