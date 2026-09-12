export interface TicketType {
  policy: string
  price: string
  description: string
  availableTickets: string
  /** Item 6 — per-ticket-type sale window, stored in the ticket policy
   *  array alongside price/description. All optional: an empty saleStart
   *  means "on sale as soon as the event is published", an empty saleEnd
   *  means "on sale until the event-wide stop date (or forever, if that's
   *  not set either)". Lets an organizer set up e.g. an "At the Gate"
   *  ticket type that only starts selling the day of the event, alongside
   *  an "Early Bird" type that stops selling before then. */
  saleStartDate?: string // "YYYY-MM-DD"
  saleStartTime?: string // "HH:mm"
  saleEndDate?: string // "YYYY-MM-DD"
  saleEndTime?: string // "HH:mm"
}
