// utils/imageUrl.js
// 云存储图片临时链接转换：绕开存储读权限（非创建者也能显示图片）
// 用法：
//   await resolveImages(dishList, ['image'])                      // 普通字段
//   await resolveImages(orderList, ['goods[].dishImage'])         // 嵌套数组字段
//   await resolveImages(list, ['images*'])                        // 字段本身是 URL 数组
//   await resolveImages(cartItems, ['info.image'])                // 点号嵌套
// 非 cloud:// 的地址原样返回，不影响

const tempUrlCache = {}

// 按点号路径取值：'info.image' -> item.info.image
function getByPath(item, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), item)
}

// 按点号路径赋值
function setByPath(item, path, value) {
  const keys = path.split('.')
  let cur = item
  for (let i = 0; i < keys.length - 1; i++) {
    if (cur[keys[i]] == null) cur[keys[i]] = {}
    cur = cur[keys[i]]
  }
  cur[keys[keys.length - 1]] = value
}

// 取出某条目某个字段里所有需要转换的 cloud:// 地址
function collectNeeded(item, field) {
  if (field.endsWith('*')) {
    // 字段本身是 URL 数组：'images*'
    const arr = item[field.slice(0, -1)]
    if (!Array.isArray(arr)) return []
    return arr.filter(u => u && u.startsWith('cloud://') && !tempUrlCache[u])
  }
  const url = getByPath(item, field)
  if (url && url.startsWith('cloud://') && !tempUrlCache[url]) {
    return [url]
  }
  return []
}

// 把条目某字段里的 cloud:// 地址替换成临时链接
function replaceInItem(item, field) {
  if (field.endsWith('*')) {
    const key = field.slice(0, -1)
    if (Array.isArray(item[key])) {
      item[key] = item[key].map(u => (tempUrlCache[u] ? tempUrlCache[u] : u))
    }
    return
  }
  const url = getByPath(item, field)
  if (url && tempUrlCache[url]) {
    setByPath(item, field, tempUrlCache[url])
  }
}

/**
 * 批量把列表/对象中的 cloud:// 图片替换为临时链接（带缓存，重复不请求）
 * @param {Array} list 数据数组（或单对象包装成数组）
 * @param {Array} fields 字段路径数组，如 ['image']、['goods[].dishImage']、['images*']、['info.image']
 * @returns {Promise<Array>} 原数组（字段已被原地替换）
 */
async function resolveImages(list, fields) {
  const fieldList = fields || ['image']

  // 第一遍：收集所有需要转换的地址（含 'goods[].dishImage' 的嵌套数组展开）
  const need = []
  ;(list || []).forEach(item => {
    fieldList.forEach(field => {
      if (field.includes('[].')) {
        // 嵌套数组：'goods[].dishImage' -> item.goods 数组里每个元素的 dishImage
        const [arrKey, restField] = field.split('[].')
        const arr = item[arrKey]
        if (Array.isArray(arr)) {
          arr.forEach(sub => {
            collectNeeded(sub, restField).forEach(u => need.push(u))
          })
        }
      } else {
        collectNeeded(item, field).forEach(u => need.push(u))
      }
    })
  })

  // 批量换取临时链接
  if (need.length > 0) {
    try {
      const res = await wx.cloud.getTempFileURL({
        fileList: need
      })
      ;(res.fileList || []).forEach(f => {
        if (f.tempFileURL) {
          tempUrlCache[f.fileID] = f.tempFileURL
        }
      })
    } catch (err) {
      console.error('获取图片临时链接失败', err)
    }
  }

  // 第二遍：替换
  ;(list || []).forEach(item => {
    fieldList.forEach(field => {
      if (field.includes('[].')) {
        const [arrKey, restField] = field.split('[].')
        const arr = item[arrKey]
        if (Array.isArray(arr)) {
          arr.forEach(sub => replaceInItem(sub, restField))
        }
      } else {
        replaceInItem(item, field)
      }
    })
  })

  return list
}

module.exports = {
  resolveImages
}
