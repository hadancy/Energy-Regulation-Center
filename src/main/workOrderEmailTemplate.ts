export const WORK_ORDER_EMAIL_SUBJECT = '[能源调控中心] 储能柜更换作业工单（CN-GC-26374）'

export const WORK_ORDER_EMAIL_TEXT = `储能柜更换作业工单

一、工单基础信息
项目：004高速公路
工单编号：CN-GC-26374
作业地点：西部高寒高架路桥分布式储能舱
施工位置：#262-04
作业类型：储能柜单体电池更换
作业负责人：
完工验收日期：

二、作业前置安全核验（完成打√）
1. 系统分断
   核验标准：PLC下发分断指令，断开储能柜#262-04并推出
   完成情况：□
2. 残余电压检测
   核验标准：万用表、绝缘摇表检测，无残余电压
   完成情况：□

三、完工验收指标
1. 数据采集
   合格标准：电压采样偏差在允许范围
   验收结果：□
   监理确认：
2. 联动功能
   合格标准：协同储能充放电、极端兜底功能正常
   验收结果：□
   监理确认：
3. 现场检查
   合格标准：旧柜体、废料、工具全部清场
   验收结果：□
   监理确认：

五、签字确认栏
作业人员：___023具身机器人_____
验收人员：__________`

const sectionTitleStyle =
  'margin:28px 0 10px;padding-left:10px;border-left:4px solid #0e7490;font-size:17px;line-height:1.4;color:#164e63'
const tableStyle =
  'width:100%;border-collapse:collapse;table-layout:fixed;font-size:14px;line-height:1.6'
const headerCellStyle =
  'padding:10px 12px;border:1px solid #cbd5e1;background:#e6f4f7;color:#164e63;font-weight:600;text-align:left'
const labelCellStyle =
  'width:24%;padding:10px 12px;border:1px solid #cbd5e1;background:#f8fafc;color:#475569;font-weight:600;vertical-align:top'
const valueCellStyle =
  'padding:10px 12px;border:1px solid #cbd5e1;color:#1f2937;vertical-align:top;word-break:break-word'

export const WORK_ORDER_EMAIL_HTML = `
  <div style="margin:0;padding:24px 12px;background:#f1f5f9;font-family:Arial,'Microsoft YaHei',sans-serif;color:#1f2937">
    <div style="max-width:760px;margin:0 auto;padding:30px;background:#ffffff;border:1px solid #dbe4ea;border-radius:12px;box-shadow:0 8px 24px rgba(15,23,42,0.06)">
      <div style="padding-bottom:20px;border-bottom:2px solid #0e7490;text-align:center">
        <h1 style="margin:0;font-size:25px;line-height:1.4;color:#0f4c5c">储能柜更换作业工单</h1>
        <p style="margin:8px 0 0;font-size:13px;color:#64748b">工单编号：CN-GC-26374</p>
      </div>

      <h2 style="${sectionTitleStyle}">一、工单基础信息</h2>
      <table role="presentation" style="${tableStyle}">
        <tr><td style="${labelCellStyle}">项目</td><td style="${valueCellStyle}">004高速公路</td></tr>
        <tr><td style="${labelCellStyle}">工单编号</td><td style="${valueCellStyle}">CN-GC-26374</td></tr>
        <tr><td style="${labelCellStyle}">作业地点</td><td style="${valueCellStyle}">西部高寒高架路桥分布式储能舱</td></tr>
        <tr><td style="${labelCellStyle}">施工位置</td><td style="${valueCellStyle}">#262-04</td></tr>
        <tr><td style="${labelCellStyle}">作业类型</td><td style="${valueCellStyle}">储能柜单体电池更换</td></tr>
        <tr><td style="${labelCellStyle}">作业负责人</td><td style="${valueCellStyle}">&nbsp;</td></tr>
        <tr><td style="${labelCellStyle}">完工验收日期</td><td style="${valueCellStyle}">&nbsp;</td></tr>
      </table>

      <h2 style="${sectionTitleStyle}">二、作业前置安全核验（完成打√）</h2>
      <table role="presentation" style="${tableStyle}">
        <tr>
          <th style="${headerCellStyle};width:22%">核验项目</th>
          <th style="${headerCellStyle}">核验标准</th>
          <th style="${headerCellStyle};width:16%;text-align:center">完成情况</th>
        </tr>
        <tr>
          <td style="${valueCellStyle}">系统分断</td>
          <td style="${valueCellStyle}">PLC下发分断指令，断开储能柜#262-04并推出</td>
          <td style="${valueCellStyle};font-size:20px;text-align:center">□</td>
        </tr>
        <tr>
          <td style="${valueCellStyle}">残余电压检测</td>
          <td style="${valueCellStyle}">万用表、绝缘摇表检测，无残余电压</td>
          <td style="${valueCellStyle};font-size:20px;text-align:center">□</td>
        </tr>
      </table>

      <h2 style="${sectionTitleStyle}">三、完工验收指标</h2>
      <table role="presentation" style="${tableStyle}">
        <tr>
          <th style="${headerCellStyle};width:18%">验收项</th>
          <th style="${headerCellStyle}">合格标准</th>
          <th style="${headerCellStyle};width:16%;text-align:center">验收结果</th>
          <th style="${headerCellStyle};width:18%">监理确认</th>
        </tr>
        <tr>
          <td style="${valueCellStyle}">数据采集</td>
          <td style="${valueCellStyle}">电压采样偏差在允许范围</td>
          <td style="${valueCellStyle};font-size:20px;text-align:center">□</td>
          <td style="${valueCellStyle}">&nbsp;</td>
        </tr>
        <tr>
          <td style="${valueCellStyle}">联动功能</td>
          <td style="${valueCellStyle}">协同储能充放电、极端兜底功能正常</td>
          <td style="${valueCellStyle};font-size:20px;text-align:center">□</td>
          <td style="${valueCellStyle}">&nbsp;</td>
        </tr>
        <tr>
          <td style="${valueCellStyle}">现场检查</td>
          <td style="${valueCellStyle}">旧柜体、废料、工具全部清场</td>
          <td style="${valueCellStyle};font-size:20px;text-align:center">□</td>
          <td style="${valueCellStyle}">&nbsp;</td>
        </tr>
      </table>

      <h2 style="${sectionTitleStyle}">五、签字确认栏</h2>
      <table role="presentation" style="${tableStyle}">
        <tr><td style="${labelCellStyle}">作业人员</td><td style="${valueCellStyle}">023具身机器人</td></tr>
        <tr><td style="${labelCellStyle}">验收人员</td><td style="${valueCellStyle}">&nbsp;</td></tr>
      </table>
    </div>
  </div>
`

export const createWorkOrderCompletionEmail = (
  completedAt: string
): { subject: string; text: string; html: string } => ({
  subject: '[能源调控中心] 工单已完成（CN-GC-26374）',
  text: `储能柜更换作业工单已完成

工单编号：CN-GC-26374
项目：004高速公路
作业地点：西部高寒高架路桥分布式储能舱
施工位置：#262-04
完成时间：${completedAt}`,
  html: `
    <div style="margin:0;padding:24px 12px;background:#f1f5f9;font-family:Arial,'Microsoft YaHei',sans-serif;color:#1f2937">
      <div style="max-width:680px;margin:0 auto;padding:30px;background:#ffffff;border:1px solid #dbe4ea;border-radius:12px">
        <div style="padding-bottom:20px;border-bottom:2px solid #16a34a;text-align:center">
          <div style="display:inline-block;margin-bottom:10px;padding:5px 12px;border-radius:999px;background:#dcfce7;color:#166534;font-size:13px;font-weight:700">工单已完成</div>
          <h1 style="margin:0;font-size:24px;line-height:1.4;color:#14532d">储能柜更换作业工单</h1>
        </div>
        <table role="presentation" style="${tableStyle};margin-top:24px">
          <tr><td style="${labelCellStyle}">工单编号</td><td style="${valueCellStyle}">CN-GC-26374</td></tr>
          <tr><td style="${labelCellStyle}">项目</td><td style="${valueCellStyle}">004高速公路</td></tr>
          <tr><td style="${labelCellStyle}">作业地点</td><td style="${valueCellStyle}">西部高寒高架路桥分布式储能舱</td></tr>
          <tr><td style="${labelCellStyle}">施工位置</td><td style="${valueCellStyle}">#262-04</td></tr>
          <tr><td style="${labelCellStyle}">完成时间</td><td style="${valueCellStyle}">${completedAt}</td></tr>
        </table>
      </div>
    </div>
  `
})
