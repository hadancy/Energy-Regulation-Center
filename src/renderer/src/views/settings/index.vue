<template>
  <div class="grid gap-6 lg:grid-cols-2">
    <el-card shadow="never" class="admin-card">
      <template #header>
        <span class="font-semibold text-slate-900">模型参数</span>
      </template>
      <div class="space-y-5">
        <div>
          <div class="mb-2 flex justify-between text-sm">
            <span class="text-slate-700">自动训练</span>
            <el-switch model-value />
          </div>
          <p class="text-sm text-slate-500">当新数据集通过校验后自动触发增量训练。</p>
        </div>
        <div>
          <p class="mb-2 text-sm text-slate-700">默认训练频率</p>
          <el-select model-value="weekly" class="w-full">
            <el-option label="每天" value="daily" />
            <el-option label="每周" value="weekly" />
            <el-option label="每月" value="monthly" />
          </el-select>
        </div>
        <div>
          <p class="mb-2 text-sm text-slate-700">告警阈值</p>
          <el-slider :model-value="76" show-input />
        </div>
      </div>
    </el-card>

    <el-card shadow="never" class="admin-card">
      <template #header>
        <span class="font-semibold text-slate-900">通知设置</span>
      </template>
      <el-form label-position="top">
        <el-form-item label="通知邮箱">
          <el-input model-value="admin@example.com" />
        </el-form-item>
        <el-form-item label="通知类型">
          <el-checkbox-group :model-value="['任务完成', '异常告警']">
            <el-checkbox label="任务完成" />
            <el-checkbox label="异常告警" />
            <el-checkbox label="模型漂移" />
          </el-checkbox-group>
        </el-form-item>
        <div class="flex justify-end">
          <el-button type="primary">保存设置</el-button>
        </div>
      </el-form>
    </el-card>
  </div>
</template>
