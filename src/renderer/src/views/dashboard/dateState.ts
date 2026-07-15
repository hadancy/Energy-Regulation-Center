import { ref } from 'vue'

export const dashboardYear = new Date().getFullYear()
export const defaultDashboardDate = new Date(dashboardYear, 3, 3)
export const selectedDashboardDate = ref(new Date(defaultDashboardDate))

let initialDateWriteAttempted = false

export function claimInitialDateWrite(): boolean {
  if (initialDateWriteAttempted) {
    return false
  }

  initialDateWriteAttempted = true
  return true
}
