# WhatsApp Order Notification Setup Guide

The ERP has WhatsApp order status notification support prepared in the codebase.

## Current Status

WhatsApp integration is code-ready but disabled by default because official client Meta WhatsApp Cloud API credentials are required.

## Required Environment Variables

```env
WHATSAPP_NOTIFICATIONS_ENABLED="false"
WHATSAPP_MESSAGE_MODE="text"
WHATSAPP_ACCESS_TOKEN=""
WHATSAPP_PHONE_NUMBER_ID=""
WHATSAPP_GRAPH_API_VERSION="v23.0"
WHATSAPP_DEFAULT_COUNTRY_CODE="91"
WHATSAPP_TEMPLATE_NAME=""
WHATSAPP_TEMPLATE_LANGUAGE="en"
NEXT_PUBLIC_APP_URL="https://your-domain.com"
APP_URL="https://your-domain.com"