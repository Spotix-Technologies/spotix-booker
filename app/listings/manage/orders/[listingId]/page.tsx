"use client"

import { useState, useEffect } from "react"
import { useRouter, useParams } from "next/navigation"
import { auth, db } from "@/lib/firebase"
import { onAuthStateChanged } from "firebase/auth"
import { collection, query, getDocs, doc, getDoc, updateDoc } from "firebase/firestore"
// import { Nav } from "@/components/nav"
import { Package, ArrowLeft, DollarSign, ShoppingBag, ChevronDown } from "lucide-react"
import Image from "next/image"

interface Order {
  id: string
  username: string
  address: string
  fullName: string
  email: string
  phoneNumber: string
  amountPaid: number
  orderDate: any
  qty: number
  status: "Processing" | "Shipped" | "Delivered"
}

export default function OrderManagementPage() {
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [orders, setOrders] = useState<Order[]>([])
  const [listing, setListing] = useState<any>(null)
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null)
  const router = useRouter()
  const params = useParams()
  const listingId = params.listingId as string

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        router.push("/login")
      } else {
        setUser(currentUser)
        await loadListingAndOrders(currentUser.uid)
      }
      setLoading(false)
    })
    return () => unsubscribe()
  }, [router, listingId])

  const loadListingAndOrders = async (userId: string) => {
    try {
      // Load listing details
      const listingRef = doc(db, "listing", userId, "products", listingId)
      const listingSnap = await getDoc(listingRef)

      if (listingSnap.exists()) {
        setListing({ id: listingSnap.id, ...listingSnap.data() })
      }

      // Load orders
      const ordersRef = collection(db, "listing", userId, "products", listingId, "orders")
      const ordersQuery = query(ordersRef)
      const ordersSnap = await getDocs(ordersQuery)

      const ordersData = ordersSnap.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Order[]

      setOrders(ordersData)
    } catch (error) {
      console.error("Error loading orders:", error)
    }
  }

  const updateOrderStatus = async (orderId: string, newStatus: "Processing" | "Shipped" | "Delivered") => {
    if (!user) return

    setUpdatingStatus(orderId)
    try {
      const orderRef = doc(db, "listing", user.uid, "products", listingId, "orders", orderId)
      await updateDoc(orderRef, { status: newStatus })

      // Update local state
      setOrders(orders.map((order) => (order.id === orderId ? { ...order, status: newStatus } : order)))
    } catch (error) {
      console.error("Error updating order status:", error)
    } finally {
      setUpdatingStatus(null)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Processing":
        return "bg-yellow-100 text-yellow-800 border-yellow-300"
      case "Shipped":
        return "bg-blue-100 text-blue-800 border-blue-300"
      case "Delivered":
        return "bg-green-100 text-green-800 border-green-300"
      default:
        return "bg-gray-100 text-gray-800 border-gray-300"
    }
  }

  const formatCurrency = (amount: number) => {
    return `₦${amount.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  const formatDate = (date: any) => {
    if (!date) return "N/A"
    const d = date.toDate ? date.toDate() : new Date(date)
    return d.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-gray-50 via-purple-50/30 to-gray-100">
        <div className="relative">
          <div className="w-16 h-16 border-4 border-[#6b2fa5]/30 border-t-[#6b2fa5] rounded-full animate-spin"></div>
          <Package className="w-8 h-8 text-[#6b2fa5] absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2" />
        </div>
        <p className="mt-4 text-gray-600 font-medium">Loading orders...</p>
      </div>
    )
  }

  const totalAmount = listing?.TotalAmount || 0
  const totalSold = listing?.TotalSold || 0

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-purple-50/30 to-gray-100">
      {/* <Nav /> */}

      <div className="container mx-auto px-4 py-12 max-w-7xl">
        {/* Back Button */}
        <button
          onClick={() => router.push("/listings/manage")}
          className="inline-flex items-center gap-2 text-[#6b2fa5] hover:text-[#5a2789] mb-6 transition-colors duration-200"
        >
          <ArrowLeft size={20} />
          <span className="font-medium">Back to Listings</span>
        </button>

        {/* Header with Product Info */}
        {listing && (
          <div className="mb-8 animate-in fade-in slide-in-from-top-4 duration-700">
            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
              <div className="flex items-start gap-6">
                {listing.images && listing.images.length > 0 && (
                  <div className="relative w-24 h-24 rounded-lg overflow-hidden flex-shrink-0">
                    <Image
                      src={listing.images[0] || "/placeholder.svg"}
                      alt={listing.productName}
                      fill
                      className="object-cover"
                    />
                  </div>
                )}
                <div className="flex-1">
                  <h1 className="text-3xl font-bold text-gray-900 mb-2">{listing.productName}</h1>
                  <p className="text-gray-600 mb-4">{listing.description}</p>
                  <div className="inline-flex items-center gap-2 bg-[#6b2fa5]/10 border border-[#6b2fa5]/20 rounded-full px-4 py-2">
                    <Package className="w-4 h-4 text-[#6b2fa5]" />
                    <span className="text-sm font-semibold text-[#6b2fa5]">
                      {orders.length} {orders.length === 1 ? "Order" : "Orders"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8 animate-in fade-in slide-in-from-top-6 duration-700">
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
                <DollarSign className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600 mb-1">Total Revenue</p>
                <p className="text-3xl font-bold text-gray-900">{formatCurrency(totalAmount)}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                <ShoppingBag className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600 mb-1">Total Units Sold</p>
                <p className="text-3xl font-bold text-gray-900">{totalSold}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Orders Section */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden animate-in fade-in duration-700">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-2xl font-bold text-gray-900">Orders</h2>
          </div>

          {orders.length === 0 ? (
            <div className="p-16 text-center">
              <div className="inline-flex items-center justify-center w-20 h-20 bg-gray-100 rounded-full mb-6">
                <ShoppingBag className="w-10 h-10 text-gray-400" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-3">No Orders Yet</h3>
              <p className="text-gray-600">Orders for this product will appear here once customers make a purchase.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-6 py-4 text-sm font-semibold text-gray-900">Order ID</th>
                    <th className="text-left px-6 py-4 text-sm font-semibold text-gray-900">Customer</th>
                    <th className="text-left px-6 py-4 text-sm font-semibold text-gray-900">Contact</th>
                    <th className="text-left px-6 py-4 text-sm font-semibold text-gray-900">Address</th>
                    <th className="text-left px-6 py-4 text-sm font-semibold text-gray-900">Qty</th>
                    <th className="text-left px-6 py-4 text-sm font-semibold text-gray-900">Amount</th>
                    <th className="text-left px-6 py-4 text-sm font-semibold text-gray-900">Date</th>
                    <th className="text-left px-6 py-4 text-sm font-semibold text-gray-900">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {orders.map((order) => (
                    <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4">
                        <p className="text-sm font-mono text-gray-900">{order.id.slice(0, 8)}</p>
                      </td>
                      <td className="px-6 py-4">
                        <div>
                          <p className="text-sm font-medium text-gray-900">{order.fullName}</p>
                          <p className="text-xs text-gray-600">@{order.username}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div>
                          <p className="text-sm text-gray-900">{order.email}</p>
                          <p className="text-xs text-gray-600">{order.phoneNumber}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm text-gray-900 max-w-xs truncate">{order.address}</p>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm font-medium text-gray-900">{order.qty}</p>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm font-bold text-gray-900">{formatCurrency(order.amountPaid)}</p>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm text-gray-600">{formatDate(order.orderDate)}</p>
                      </td>
                      <td className="px-6 py-4">
                        <div className="relative">
                          <select
                            value={order.status}
                            onChange={(e) => updateOrderStatus(order.id, e.target.value as any)}
                            disabled={updatingStatus === order.id}
                            className={`appearance-none text-sm font-medium px-3 py-2 pr-8 rounded-lg border ${getStatusColor(order.status)} focus:outline-none focus:ring-2 focus:ring-[#6b2fa5] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed`}
                          >
                            <option value="Processing">Processing</option>
                            <option value="Shipped">Shipped</option>
                            <option value="Delivered">Delivered</option>
                          </select>
                          <ChevronDown className="absolute right-2 top-1/2 transform -translate-y-1/2 w-4 h-4 pointer-events-none" />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
