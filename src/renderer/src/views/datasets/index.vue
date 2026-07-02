<template>
  <el-card shadow="never" class="admin-card">
    <template #header>
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <span class="font-semibold text-slate-900">数据集管理</span>
        <div class="flex gap-2">
          <el-button>批量导入</el-button>
          <el-button type="primary">新建数据集</el-button>
        </div>
      </div>
    </template>

    <div class="dataset-filter mb-4 grid min-w-0 gap-3 md:grid-cols-3">
      <el-input class="min-w-0" placeholder="搜索数据集名称" clearable />
      <el-select class="min-w-0" placeholder="数据类型" clearable>
        <el-option label="销售数据" value="sales" />
        <el-option label="用户数据" value="users" />
        <el-option label="库存数据" value="stock" />
      </el-select>
      <el-date-picker
        type="daterange"
        start-placeholder="开始日期"
        end-placeholder="结束日期"
        class="w-full! min-w-0"
      />
    </div>

    <el-table
      :data="[
        { name: 'sales_2026_q2', rows: '128,490', type: '销售数据', updated: '2026-06-29' },
        { name: 'member_growth', rows: '42,810', type: '用户数据', updated: '2026-06-26' },
        { name: 'warehouse_stock', rows: '18,902', type: '库存数据', updated: '2026-06-23' }
      ]"
      class="w-full"
    >
      <el-table-column prop="name" label="数据集名称" min-width="160" />
      <el-table-column prop="type" label="类型" width="120" />
      <el-table-column prop="rows" label="记录数" width="120" />
      <el-table-column prop="updated" label="更新时间" width="140" />
      <el-table-column label="操作" width="170">
        <template #default>
          <el-button link type="primary">查看</el-button>
          <el-button link type="primary">训练</el-button>
          <el-button link type="danger">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
  </el-card>
</template>
