""" return a qrcode svg """
import io
import qrcode
import qrcode.image.svg


def qr_svg(url):
    """ will return qr_svg of value """
    factory = qrcode.image.svg.SvgPathImage  # fragment
    img = qrcode.make(url, image_factory=factory)
    output = io.BytesIO()
    img._write(output)  # pylint: disable=W0212
    return output.getvalue()
