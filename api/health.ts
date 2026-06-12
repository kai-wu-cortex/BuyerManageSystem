type VercelResponse = {
  status: (statusCode: number) => {
    json: (body: unknown) => unknown;
  };
};

export default function handler(_req: unknown, res: VercelResponse) {
  return res.status(200).json({
    success: true,
    service: 'buyer-manage-system',
    time: new Date().toISOString(),
  });
}
