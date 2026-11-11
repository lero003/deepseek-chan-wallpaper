import Darwin
import Foundation

/// Reports the process's own physical footprint (Activity Monitor's "Memory" gauge for this app).
public enum ProcessMemory {
    /// `TASK_VM_INFO.phys_footprint`: dirty + compressed pages owned by this process.
    public static func footprintBytes() -> UInt64? {
        var info = task_vm_info_data_t()
        var count = mach_msg_type_number_t(MemoryLayout<task_vm_info_data_t>.size / MemoryLayout<integer_t>.size)
        let result = withUnsafeMutablePointer(to: &info) { pointer -> kern_return_t in
            pointer.withMemoryRebound(to: integer_t.self, capacity: Int(count)) { rebound in
                task_info(mach_task_self_, task_flavor_t(TASK_VM_INFO), rebound, &count)
            }
        }
        guard result == KERN_SUCCESS else { return nil }
        return info.phys_footprint
    }

    public static func megabytes(_ bytes: UInt64) -> String {
        String(format: "%.1f", Double(bytes) / 1_048_576)
    }

    public static func formatted() -> String? {
        footprintBytes().map { "\(megabytes($0)) MB" }
    }
}
