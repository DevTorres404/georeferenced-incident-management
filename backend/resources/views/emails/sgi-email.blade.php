<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="color-scheme" content="light">
    <meta name="supported-color-schemes" content="light">
    <title>{{ $subject }}</title>
    <style>
        body,
        table,
        td,
        a {
            -webkit-text-size-adjust: 100%;
            -ms-text-size-adjust: 100%;
        }

        table,
        td {
            mso-table-lspace: 0;
            mso-table-rspace: 0;
        }

        body {
            width: 100% !important;
            margin: 0;
            padding: 0;
            background-color: #f8fafc;
            color: #334155;
            font-family: Arial, Helvetica, sans-serif;
            -webkit-font-smoothing: antialiased;
        }

        .wrapper {
            width: 100%;
            padding: 36px 16px;
            background-color: #f8fafc;
        }

        .email-container {
            width: 100%;
            max-width: 620px;
            margin: 0 auto;
            overflow: hidden;
            border: 1px solid #dce3ea;
            border-radius: 12px;
            background-color: #ffffff;
        }

        .header {
            padding: 30px 38px;
            color: #ffffff;
            background: #060a12 linear-gradient(135deg, #0f2031, #21598a);
        }

        .brand-table {
            width: 100%;
            border-spacing: 0;
        }

        .brand-mark {
            display: inline-block;
            width: 50px;
            height: 50px;
            border-radius: 9px;
            background-color: #ffffff;
            color: #15629c;
            font-size: 17px;
            font-weight: 700;
            line-height: 50px;
            text-align: center;
        }

        .brand-name {
            padding-left: 14px;
            color: #cbd5e1;
            font-size: 12px;
            line-height: 18px;
            vertical-align: middle;
        }

        .brand-name strong {
            display: block;
            color: #ffffff;
            font-size: 17px;
            line-height: 22px;
        }

        .accent-line {
            height: 4px;
            background-color: #1f8edb;
            font-size: 0;
            line-height: 4px;
        }

        .content {
            padding: 34px 38px 30px;
            background-color: #ffffff;
        }

        .eyebrow {
            margin: 0 0 8px;
            color: #15629c;
            font-size: 12px;
            font-weight: 700;
            letter-spacing: 0.8px;
            line-height: 18px;
            text-transform: uppercase;
        }

        h1 {
            margin: 0 0 22px;
            color: #0f172a;
            font-size: 27px;
            line-height: 34px;
        }

        p {
            margin: 0 0 17px;
            color: #334155;
            font-size: 15px;
            line-height: 24px;
        }

        strong {
            color: #0f172a;
        }

        .code-box {
            margin: 26px 0;
            padding: 22px 20px;
            border: 1px solid #dce3ea;
            border-left: 4px solid #1f8edb;
            border-radius: 9px;
            background-color: #f8fafc;
            text-align: center;
        }

        .code-label {
            display: block;
            margin-bottom: 8px;
            color: #64748b;
            font-size: 12px;
            font-weight: 700;
            letter-spacing: 0.7px;
            line-height: 18px;
            text-transform: uppercase;
        }

        .code {
            color: #15629c;
            font-family: Consolas, Monaco, monospace;
            font-size: 30px;
            font-weight: 700;
            letter-spacing: 6px;
            line-height: 38px;
        }

        .button-wrap {
            margin: 28px 0;
            text-align: center;
        }

        .button {
            display: inline-block;
            padding: 14px 28px;
            border-radius: 8px;
            background-color: #1f8edb;
            color: #ffffff !important;
            font-size: 15px;
            font-weight: 700;
            line-height: 18px;
            text-decoration: none;
        }

        .list {
            width: 100%;
            margin: 8px 0 20px;
            border-spacing: 0;
        }

        .list-number {
            width: 28px;
            height: 28px;
            border-radius: 50%;
            background-color: #e8f4fc;
            color: #15629c;
            font-size: 12px;
            font-weight: 700;
            line-height: 28px;
            text-align: center;
        }

        .list-text {
            padding: 8px 0 8px 12px;
            color: #334155;
            font-size: 14px;
            line-height: 21px;
        }

        .notice {
            margin: 25px 0 0;
            padding: 16px 18px;
            border: 1px solid #dce3ea;
            border-left: 4px solid #1f8edb;
            border-radius: 8px;
            background-color: #f8fafc;
            color: #64748b;
            font-size: 13px;
            line-height: 21px;
        }

        .footer {
            padding: 24px 38px 28px;
            border-top: 1px solid #dce3ea;
            background-color: #f8fafc;
            text-align: center;
        }

        .footer p {
            margin: 0 0 8px;
            color: #64748b;
            font-size: 12px;
            line-height: 18px;
            text-align: center;
        }

        .footer-link {
            color: #15629c;
            font-size: 12px;
            line-height: 18px;
            text-decoration: underline;
            word-break: break-all;
        }

        @media screen and (max-width: 600px) {
            .wrapper {
                padding: 0;
            }

            .email-container {
                border-right: 0;
                border-left: 0;
                border-radius: 0;
            }

            .header,
            .content,
            .footer {
                padding-right: 24px;
                padding-left: 24px;
            }

            .brand-name strong {
                font-size: 15px;
            }

            h1 {
                font-size: 24px;
                line-height: 31px;
            }
        }
    </style>
</head>
<body>
    <table class="wrapper" width="100%" cellpadding="0" cellspacing="0" role="presentation">
        <tr>
            <td align="center">
                <table class="email-container" cellpadding="0" cellspacing="0" role="presentation">
                    <tr>
                        <td class="header">
                            <table class="brand-table" cellpadding="0" cellspacing="0" role="presentation">
                                <tr>
                                    <td width="50">
                                        <span class="brand-mark">SGI</span>
                                    </td>
                                    <td class="brand-name">
                                        <strong>Sistema de Gestión de Incidencias</strong>
                                        Gestión ciudadana georreferenciada
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <tr>
                        <td class="accent-line">&nbsp;</td>
                    </tr>

                    <tr>
                        <td class="content">
                            <p class="eyebrow">{{ $eyebrow ?? 'Notificación SGI' }}</p>
                            <h1>{{ $title }}</h1>
                            <p>Hola <strong>{{ $displayName }}</strong>,</p>
                            <p>{{ $intro }}</p>

                            @isset($code)
                                <div class="code-box">
                                    <span class="code-label">{{ $codeLabel ?? 'Código de seguridad' }}</span>
                                    <span class="code">{{ $code }}</span>
                                </div>
                            @endisset

                            @foreach ($lines ?? [] as $line)
                                <p>{{ $line }}</p>
                            @endforeach

                            @if (! empty($items))
                                <table class="list" cellpadding="0" cellspacing="0" role="presentation">
                                    @foreach ($items as $index => $item)
                                        <tr>
                                            <td width="28"><div class="list-number">{{ $index + 1 }}</div></td>
                                            <td class="list-text">{{ $item }}</td>
                                        </tr>
                                    @endforeach
                                </table>
                            @endif

                            @if (! empty($actionLabel) && ! empty($actionUrl))
                                <div class="button-wrap">
                                    <a href="{{ $actionUrl }}" class="button">{{ $actionLabel }}</a>
                                </div>
                            @endif

                            @isset($notice)
                                <div class="notice">{{ $notice }}</div>
                            @endisset
                        </td>
                    </tr>

                    <tr>
                        <td class="footer">
                            <p>&copy; {{ date('Y') }} SGI. Todos los derechos reservados.</p>
                            <p>Sistema de Gestión de Incidencias</p>
                            @if (! empty($actionUrl))
                                <p>Si el botón no funciona, copia y pega este enlace en tu navegador:</p>
                                <a href="{{ $actionUrl }}" class="footer-link">{{ $actionUrl }}</a>
                            @endif
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
